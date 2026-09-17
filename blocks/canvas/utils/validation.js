import { getQuickEditNx } from '../../../scripts/utils.js';

const { sanitizeValidationItems, MESSAGE_TYPES } = await import(`${getQuickEditNx()}/public/plugins/quick-edit/validation.js`);

function makeRequestId() {
  return `val-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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
    const sanitizedItems = sanitizeValidationItems(items);
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
