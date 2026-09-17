import { getQuickEditNx } from '../../../scripts/utils.js';

const { sanitizeValidationItems, MESSAGE_TYPES } = await import(`${getQuickEditNx()}/public/plugins/quick-edit/validation.js`);

const MAX_ITEMS = 200;

function makeRequestId() {
  return `val-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Re-validates every RESULT item itself (never trusts the sender's filter) — the actual
// untrusted-input boundary. Item-count cap is a separate, this-host storage policy.
function sanitizeAndCapValidationItems(items) {
  return sanitizeValidationItems(items).slice(0, MAX_ITEMS);
}

// No timeout here — a hung/absent runner is bounded by preflight's own per-provider
// timeout (see providers/project-validation.js), which just stops waiting rather than
// resolving a graceful "taking too long" state.
//
// Only one outstanding request is tracked at a time — a new run() abandons the previous
// one, whose eventual RESULT (if it arrives) is ignored as stale.
export function createValidationRequester(port) {
  let pendingRequestId = null;
  let resolvePending = null;

  function settle(result) {
    pendingRequestId = null;
    const resolve = resolvePending;
    resolvePending = null;
    resolve?.(result);
  }

  port.onmessage = (ev) => {
    const { type, requestId, items, hasRunner } = ev.data ?? {};
    if (requestId !== pendingRequestId) return;
    if (type !== MESSAGE_TYPES.RESULT) return;
    const sanitizedItems = sanitizeAndCapValidationItems(items);
    settle({ items: sanitizedItems, hasRunner: Boolean(hasRunner) });
  };

  function run() {
    return new Promise((resolve) => {
      resolvePending = resolve;
      const requestId = makeRequestId();
      pendingRequestId = requestId;
      port.postMessage({ type: MESSAGE_TYPES.RUN, requestId });
    });
  }

  function dispose() {
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
