import { getNx } from '../../../scripts/utils.js';

// Quick-edit only exists under nx/ (never nx2/), regardless of the page's nxVer
// flag — force the base nx here so this just imports without having to know
// about nx-version resolution.
const nx = getNx();
const quickEditNx = nx.endsWith('/nx2') ? nx.slice(0, -1) : nx;

const { sanitizeValidationItems, MESSAGE_TYPES } = await import(`${quickEditNx}/public/plugins/quick-edit/validation.js`);

const RUN_TIMEOUT_MS = 4000;
const MAX_ITEMS = 200;

function makeRequestId() {
  return `val-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Independently re-validates every RESULT item itself (never trusts that the sender used
// da-nx's own pre-send filter) — this is the actual untrusted-input boundary; the cap on
// total item count is this host's own storage policy, kept separate from item shape.
function sanitizeAndCapValidationItems(items) {
  return sanitizeValidationItems(items).slice(0, MAX_ITEMS);
}

// Owns the validation port's request/timeout/correlation lifecycle for one port. Only one
// outstanding request is tracked at a time — a new run() abandons any previous one, whose
// eventual RESULT (if it arrives) is ignored as stale.
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
    const { requestId, items } = ev.data;
    if (requestId !== pendingRequestId) return;
    settle({ items: sanitizeAndCapValidationItems(items), timedOut: false });
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
        settle({ items: null, timedOut: true });
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
