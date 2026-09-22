import { getQuickEditNx } from '../../../scripts/utils.js';

const { sanitizeCustomValidationItems, MESSAGE_TYPES } = await import(`${getQuickEditNx()}/public/plugins/quick-edit/custom-validation.js`);

// No ACK in this window means the other end doesn't understand the protocol (e.g. an
// old quick-edit.js) -- don't wait for a RESULT that'll never come. A slow check past
// ACK is bounded by the caller's own abort signal, not this module.
const ACK_TIMEOUT_MS = 500;

function makeRequestId() {
  return `val-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createCustomValidationRequester(port, { ackTimeoutMs = ACK_TIMEOUT_MS } = {}) {
  let pendingRequestId = null;
  let resolvePending = null;
  let ackTimeoutId = null;

  function settle(result) {
    pendingRequestId = null;
    clearTimeout(ackTimeoutId);
    ackTimeoutId = null;
    const resolve = resolvePending;
    resolvePending = null;
    resolve?.(result);
  }

  port.onmessage = (ev) => {
    const { type, requestId, items, hasCustomValidation } = ev.data ?? {};
    if (requestId !== pendingRequestId) return;
    if (type === MESSAGE_TYPES.ACK) {
      clearTimeout(ackTimeoutId);
      ackTimeoutId = null;
      return;
    }
    if (type !== MESSAGE_TYPES.RESULT) return;
    const sanitizedItems = sanitizeCustomValidationItems(items);
    settle({ items: sanitizedItems, hasCustomValidation: Boolean(hasCustomValidation) });
  };

  function run() {
    return new Promise((resolve) => {
      resolvePending = resolve;
      const requestId = makeRequestId();
      pendingRequestId = requestId;
      ackTimeoutId = setTimeout(() => {
        settle({ items: [], hasCustomValidation: false });
      }, ackTimeoutMs);
      port.postMessage({ type: MESSAGE_TYPES.RUN, requestId });
    });
  }

  function dispose() {
    pendingRequestId = null;
    clearTimeout(ackTimeoutId);
    ackTimeoutId = null;
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
