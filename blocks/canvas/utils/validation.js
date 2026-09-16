import { getQuickEditNx } from '../../../scripts/utils.js';

const { sanitizeValidationItems, MESSAGE_TYPES } = await import(`${getQuickEditNx()}/public/plugins/quick-edit/validation.js`);

const RUN_TIMEOUT_MS = 4000;
const MAX_ITEMS = 200;

function makeRequestId() {
  return `val-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Re-validates every RESULT item itself (never trusts the sender's filter) — the actual
// untrusted-input boundary. Item-count cap is a separate, this-host storage policy.
function sanitizeAndCapValidationItems(items) {
  return sanitizeValidationItems(items).slice(0, MAX_ITEMS);
}

// Only one outstanding request is tracked at a time — a new run() abandons the previous
// one, whose eventual RESULT (if it arrives) is ignored as stale.
export function createValidationRequester(port) {
  let pendingRequestId = null;
  let timeoutId = null;
  let resolvePending = null;

  function settle(result) {
    clearTimeout(timeoutId);
    timeoutId = null;
    pendingRequestId = null;
    const resolve = resolvePending;
    resolvePending = null;
    resolve?.(result);
  }

  port.onmessage = (ev) => {
    if (ev.data?.type !== MESSAGE_TYPES.RESULT) return;
    const { requestId, items, hasRunner } = ev.data;
    if (requestId !== pendingRequestId) return;
    const sanitizedItems = sanitizeAndCapValidationItems(items);
    settle({ items: sanitizedItems, timedOut: false, hasRunner: Boolean(hasRunner) });
  };

  function run() {
    return new Promise((resolve) => {
      clearTimeout(timeoutId);
      resolvePending = resolve;
      const requestId = makeRequestId();
      pendingRequestId = requestId;
      port.postMessage({ type: MESSAGE_TYPES.RUN, requestId });
      timeoutId = setTimeout(() => {
        if (pendingRequestId !== requestId) return;
        // eslint-disable-next-line no-console
        console.warn('[validation] run timed out', requestId);
        settle({ items: null, timedOut: true, hasRunner: null });
      }, RUN_TIMEOUT_MS);
    });
  }

  function dispose() {
    clearTimeout(timeoutId);
    timeoutId = null;
    pendingRequestId = null;
    resolvePending = null;
    port.onmessage = null;
    try {
      port.close();
    } catch {
      /* ignore */
    }
  }

  return { run, dispose };
}
