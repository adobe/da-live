import ootb from './ootb/ootb-checks.js';
import projectValidation from './project-validation.js';
import { STATUS, SEVERITY, createResult } from '../views/result.js';

/*
 * Provider contract (every provider in this registry must conform):
 *
 * Shape:
 * - Export an object: { id: string, getResults: function }
 * - getResults({ details, signal, onUpdate }) returns Category[] (sync or async)
 * - Category: { title: string, checks: Check[] }
 * - Check: { title: string, items: PreflightResultLike[], done: boolean }
 * - PreflightResultLike item:
 *   - has settle(result, badge, reason)
 *   - exposes status/result/badge/reason fields used by preflight rendering + status emit
 *
 * Lifecycle expectations:
 * - Return a full category/check skeleton immediately when possible.
 * - For slow checks, return pending items up front, then mutate the same item objects as
 *   work resolves, and call onUpdate() after each visible change.
 * - Honor signal for cancellable operations where practical.
 * - Isolate per-check failures to item-level error outcomes instead of throwing from getResults.
 */
const PROVIDERS = [ootb, projectValidation];

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
  item.settle(SEVERITY.ERROR, SEVERITY.ERROR, reason?.message || 'Provider failed to load results.');

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

// Guards against a provider whose getResults() promise never settles at all (a bootstrap
// hang, as opposed to a slow item handled by settlePendingResults). Without this, one
// hung provider would block Promise.all forever and the signal's abort listener in
// watchForTimeout would never even get attached. A future 'abort' event forces it
// immediately; an already-aborted signal is deferred to a macrotask instead, so a fast
// provider still wins the race (its promise settles on a microtask) but a genuinely
// hung one can't block Promise.all forever just because the signal fired before this ran.
function withBootstrapTimeout(outcome, signal) {
  if (!signal) return outcome;
  const timeout = new Promise((resolve) => {
    const forceTimeout = () => resolve({ status: 'rejected', reason: new Error(TIMEOUT_REASON) });
    if (signal.aborted) setTimeout(forceTimeout, 0);
    else signal.addEventListener('abort', forceTimeout, { once: true });
  });
  return Promise.race([outcome, timeout]);
}

// Safety net for checks still pending when the shared signal aborts: force them settled so
// the panel doesn't spin forever and maybeEmitStatus() in preflight.js can still fire.
// Providers should still handle `signal` themselves where they can (e.g. abort their own
// fetches) - this only guarantees the UI/status never hangs if they don't.
function settlePendingResults(categories) {
  let changed = false;
  categories.forEach((category) => {
    category.checks.forEach((check) => {
      check.items.forEach((item) => {
        if (item?.status === STATUS.DONE) return;
        item.settle(SEVERITY.ERROR, SEVERITY.ERROR, TIMEOUT_REASON);
        changed = true;
      });
      if (!check.done) {
        if (check.items.length === 0) {
          const item = createResult();
          item.settle(SEVERITY.ERROR, SEVERITY.ERROR, TIMEOUT_REASON);
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
export async function loadProviderResults({ details, signal, onUpdate, providers = PROVIDERS }) {
  const settled = await Promise.all(
    providers.map((provider) => withBootstrapTimeout(
      toSettledOutcome(runProvider(provider, { details, signal, onUpdate })),
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
