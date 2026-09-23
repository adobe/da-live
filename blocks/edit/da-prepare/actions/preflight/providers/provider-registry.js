import ootb from './ootb/ootb-checks.js';
import { STATUS, SEVERITY, createResult } from '../views/result.js';

/*
 * Provider contract:
 * - Export { id: string, getResults: function }
 * - getResults({ context, signal, onUpdate }) returns Category[] (sync or async)
 * - Category: { title, checks: Check[] }; Check: { title, items: PreflightResultLike[], done }
 * - PreflightResultLike: has settle(result, reason); exposes status/result/reason
 * - context is details merged with context.js's execution-environment fields (isCanvas,
 *   canvasReady, getCanvasHtml), built once per run -- a provider that needs the canvas
 *   host reads them off context rather than detecting canvas itself.
 *
 * Return a full skeleton immediately; for slow checks, return pending items then mutate
 * them in place and call onUpdate(). Honor signal where practical. Isolate per-check
 * failures to item-level errors instead of throwing from getResults.
 */
const PROVIDERS = [ootb];

// Providers resolve getResults() fast with a full skeleton, then fill in slow checks by
// mutating the same check/item objects later and calling onUpdate. Only shallow-copy
// here (never clone checks/items) or progressive updates silently stop working.
function mergeCategories(target, categories) {
  categories.forEach((category) => {
    const existing = target.find((cat) => cat.title === category.title);
    if (existing) {
      existing.checks.push(...category.checks);
    } else {
      target.push({ ...category, open: category.open ?? false });
    }
  });
}

// Failing provider becomes a single visible check rather than breaking the whole panel
function toErrorCategory(provider, reason) {
  const item = createResult();
  item.settle(SEVERITY.ERROR, reason?.message || 'Provider failed to load results.');

  return [{
    title: 'Errors',
    checks: [{
      title: provider.id || 'Unknown provider',
      items: [item],
      done: true,
    }],
  }];
}

// Wrapped so a provider that throws synchronously is isolated the same as an async rejection
function runProvider(provider, args) {
  return Promise.resolve().then(() => provider.getResults(args));
}

const TIMEOUT_REASON = 'Timed out waiting for this check.';

function toSettledOutcome(promise) {
  return promise.then(
    (value) => ({ status: 'fulfilled', value }),
    (reason) => ({ status: 'rejected', reason }),
  );
}

// Guards a getResults() that never settles (a bootstrap hang, not the slow-item case
// settlePendingResults handles) — otherwise it blocks Promise.all and watchForTimeout's
// abort listener never gets attached. Already-aborted signals defer via macrotask so a
// fast provider still wins the race.
function withBootstrapTimeout(outcome, signal) {
  if (!signal) return outcome;
  const timeout = new Promise((resolve) => {
    const forceTimeout = () => resolve({ status: 'rejected', reason: new Error(TIMEOUT_REASON) });
    if (signal.aborted) setTimeout(forceTimeout, 0);
    else signal.addEventListener('abort', forceTimeout, { once: true });
  });
  return Promise.race([outcome, timeout]);
}

// Safety net for checks still pending when the shared signal aborts: force-settle them so
// the panel doesn't spin forever. Providers should still handle `signal` themselves where
// they can — this just guarantees the UI never hangs if they don't.
function settlePendingResults(categories) {
  let changed = false;
  categories.forEach((category) => {
    category.checks.forEach((check) => {
      check.items.forEach((item) => {
        if (item?.status === STATUS.DONE) return;
        item.settle(SEVERITY.ERROR, TIMEOUT_REASON);
        changed = true;
      });
      if (!check.done) {
        if (check.items.length === 0) {
          const item = createResult();
          item.settle(SEVERITY.ERROR, TIMEOUT_REASON);
          check.items.push(item);
        }
        check.done = true;
        changed = true;
      }
    });
  });
  return changed;
}

function watchForTimeout(categories, signal, onUpdate) {
  if (!signal) return;
  const sweep = () => {
    if (settlePendingResults(categories) && onUpdate) onUpdate();
  };
  if (signal.aborted) sweep();
  else signal.addEventListener('abort', sweep, { once: true });
}

// onUpdate: called by a provider whenever a pending check/result it already returned
// settles later, so the caller can requestUpdate() without waiting on this promise again.
// providers: overridable for tests; production callers rely on the PROVIDERS default.
export async function loadProviderResults({ context, signal, onUpdate, providers = PROVIDERS }) {
  const settled = await Promise.all(
    providers.map((provider) => withBootstrapTimeout(
      toSettledOutcome(runProvider(provider, { context, signal, onUpdate })),
      signal,
    )),
  );

  const categories = [];
  settled.forEach((outcome, i) => {
    const provider = providers[i];
    let providerCategories;
    if (outcome.status === 'fulfilled') {
      providerCategories = outcome.value;
    } else {
      providerCategories = toErrorCategory(provider, outcome.reason);
    }
    mergeCategories(categories, providerCategories);
  });

  watchForTimeout(categories, signal, onUpdate);

  return categories;
}
