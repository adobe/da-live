/**
 * Opt-in debug logger for the selection-toolbar state machine.
 *
 * Enable by any of:
 *   - localStorage.setItem('nx-tb-debug', '1')
 *   - add ?nx-tb-debug to the URL
 *   - window.__nxToolbarDebug = true
 *
 * Inspect after the fact:
 *   window.__nxToolbarLog()                 // returns the ring buffer
 *   window.__nxToolbarLog({ clear: true })  // returns and clears
 *
 * Designed for intermittent-bug postmortems: every state transition,
 * iframe message, focus/blur, and visibility decision lands in the buffer
 * with a monotonic timestamp so the order of operations can be reconstructed.
 */

const FLAG = 'nx-tb-debug';
const MAX_BUFFER = 1000;
const buffer = [];

let cachedEnabled;
function isEnabled() {
  if (cachedEnabled !== undefined) return cachedEnabled;
  let on = false;
  try {
    /* eslint-disable no-underscore-dangle */
    if (window.__nxToolbarDebug === true) on = true;
    else if (new URLSearchParams(window.location.search).has(FLAG)) on = true;
    else if (window.localStorage?.getItem(FLAG) === '1') on = true;
    /* eslint-enable no-underscore-dangle */
  } catch {
    /* ignore */
  }
  cachedEnabled = on;
  return on;
}

export function tbLog(event, data) {
  if (!isEnabled()) return;
  const entry = { t: Math.round(performance.now()), event, ...(data ?? {}) };
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  // eslint-disable-next-line no-console
  console.debug('[nx-tb]', event, data ?? '');
}

if (typeof window !== 'undefined') {
  // eslint-disable-next-line no-underscore-dangle
  window.__nxToolbarLog = ({ clear = false } = {}) => {
    const snapshot = [...buffer];
    if (clear) buffer.length = 0;
    return snapshot;
  };
}
