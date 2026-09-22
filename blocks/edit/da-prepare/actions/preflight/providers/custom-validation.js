import { canvasBus } from '../../../../../canvas/utils/canvas-bus.js';
import { createResult, SEVERITY } from '../views/result.js';

const CATEGORY = 'Custom';
const ALLOWED_SEVERITIES = new Set(Object.values(SEVERITY));

function toPreflightItem({ severity, message }) {
  const item = createResult();
  item.settle(severity, message || '');
  return item;
}

export function buildProjectValidationChecks({ results = [], hasCustomValidation } = {}) {
  if (!hasCustomValidation) return null;

  // Invalid severities are silently dropped rather than surfaced as an error item --
  // the allowed vocabulary is a preflight concern, not da-nx's to validate.
  const validResults = results.filter(({ severity } = {}) => ALLOWED_SEVERITIES.has(severity));

  if (validResults.length === 0) {
    const item = createResult();
    item.settle(SEVERITY.SUCCESS, 'No custom-validation issues found.');
    return [{ title: 'Custom validation', items: [item], done: true }];
  }

  const groups = Object.groupBy(validResults, (item) => item.title ?? 'Custom validation');
  return Object.entries(groups).map(([title, items]) => ({
    title,
    items: items.map(toPreflightItem),
    done: true,
  }));
}

// ew-editor-wysiwyg.js is a static top-level import of canvas.js, so its custom element is
// registered as soon as canvas's module graph loads -- well before any lazy tool-panel view
// (e.g. the Preflight panel) gets a chance to run. A reliable, synchronous "could a host ever
// exist here" check, independent of whether it has announced ready yet.
function canvasHostMayExist() {
  return !!customElements.get('ew-editor-wysiwyg');
}

// A host mounting in canvas can race a provider run that starts the instant a lazily-created
// panel connects (unlike the classic dialog, only ever opened well after canvas has settled).
// validationHostReady replays its last value to a late subscriber, so this resolves immediately
// once the host announces itself; the grace timeout only matters while genuinely racing it.
const HOST_READY_GRACE_MS = 500;

function waitForValidationHost(signal) {
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    let unsubscribe;
    const finish = (ready) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      resolve(ready);
    };
    // A replayed value can call finish() synchronously, before subscribe() has returned and
    // this assignment has happened - finish() no-ops on unsubscribe in that case, so clean up
    // here instead once it's available.
    unsubscribe = canvasBus.validationHostReady.subscribe((ready) => finish(!!ready));
    if (settled) {
      unsubscribe();
      return;
    }
    timer = setTimeout(() => finish(false), HOST_READY_GRACE_MS);
    signal?.addEventListener('abort', () => finish(false), { once: true });
  });
}

async function getResults({ signal } = {}) {
  if (signal?.aborted) return [];

  // No EW/canvas host could ever exist (e.g. classic /edit) -- resolve now instead of
  // riding the shared load-timeout, which would otherwise block the whole panel from
  // rendering until it fires.
  if (!canvasHostMayExist()) return [];
  if (!(await waitForValidationHost(signal))) return [];
  // An abort event fired while awaiting the host above would have found no listener yet
  // (registered below) and gone unseen - re-check rather than risk hanging on it forever.
  if (signal?.aborted) return [];

  return new Promise((resolve) => {
    const unsubscribe = canvasBus.validationResultState.subscribe((detail) => {
      unsubscribe();
      const { items = [], hasCustomValidation = false } = detail || {};
      const checks = buildProjectValidationChecks({ results: items, hasCustomValidation }) ?? [];
      resolve(checks.length ? [{ title: CATEGORY, checks }] : []);
    });

    signal?.addEventListener('abort', () => {
      unsubscribe();
      resolve([]);
    }, { once: true });

    canvasBus.validationRunRequest.emit();
  });
}

export default { id: 'custom-validation', getResults };
