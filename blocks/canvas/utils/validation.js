import { getQuickEditNx } from '../../../scripts/utils.js';

const { sanitizeValidationItems, MESSAGE_TYPES } = await import(`${getQuickEditNx()}/public/plugins/quick-edit/validation.js`);

const ACK_TIMEOUT_MS = 1000;
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

  function clearPendingTimeout() {
    clearTimeout(timeoutId);
    timeoutId = null;
  }

  function settle(result) {
    clearPendingTimeout();
    pendingRequestId = null;
    const resolve = resolvePending;
    resolvePending = null;
    resolve?.(result);
  }

  // hasRunner: null distinguishes "no ACK arrived at all" (old host/no quick-edit here,
  // resolved by the ack-phase timeout below) from "ACK'd, but RESULT never arrived" (a
  // genuinely slow/hung check, resolved by the longer result-phase timeout).
  port.onmessage = (ev) => {
    const { type, requestId, items, hasRunner } = ev.data ?? {};
    if (requestId !== pendingRequestId) return;
    if (type === MESSAGE_TYPES.ACK) {
      clearPendingTimeout();
      timeoutId = setTimeout(() => {
        if (pendingRequestId !== requestId) return;
        // eslint-disable-next-line no-console
        console.warn('[validation] acked but result never arrived', requestId);
        settle({ items: null, timedOut: true, hasRunner: Boolean(hasRunner) });
      }, RUN_TIMEOUT_MS);
      return;
    }
    if (type !== MESSAGE_TYPES.RESULT) return;
    const sanitizedItems = sanitizeAndCapValidationItems(items);
    settle({ items: sanitizedItems, timedOut: false, hasRunner: Boolean(hasRunner) });
  };

  function run() {
    return new Promise((resolve) => {
      clearPendingTimeout();
      resolvePending = resolve;
      const requestId = makeRequestId();
      pendingRequestId = requestId;
      port.postMessage({ type: MESSAGE_TYPES.RUN, requestId });
      timeoutId = setTimeout(() => {
        if (pendingRequestId !== requestId) return;
        // eslint-disable-next-line no-console
        console.warn('[validation] run not acked', requestId);
        settle({ items: null, timedOut: true, hasRunner: null });
      }, ACK_TIMEOUT_MS);
    });
  }

  function dispose() {
    clearPendingTimeout();
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
