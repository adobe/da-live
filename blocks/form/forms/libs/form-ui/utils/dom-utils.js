/**
 * DOM utilities shared across Form UI modules.
 */

/**
 * Return the control element from a node: the node itself if it is an
 * input/select/textarea, or the first matching descendant inside it.
 * @param {HTMLElement|null} node
 * @returns {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|null}
 */
export default function getControlElement(node) {
  if (!node || typeof node.matches !== 'function') return null;
  if (node.matches('input, select, textarea')) return node;
  return node.querySelector('input, select, textarea');
}

/**
 * Get the deeply focused element, traversing into shadow roots.
 * @returns {Element|null}
 */
export function getDeepActiveElement() {
  let active = document.activeElement || null;
  try {
    while (active && active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement;
    }
  } catch { /* noop */ }
  return active;
}

/** Determine if an element is scrollable on the Y axis (considers CSS overflow). */
export function isElementScrollableY(el) {
  if (!el) return false;
  try {
    const style = el.ownerDocument?.defaultView?.getComputedStyle(el);
    const overflowY = style?.overflowY;
    const canScroll = el.scrollHeight > el.clientHeight;
    return canScroll && (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay');
  } catch {
    return el.scrollHeight > el.clientHeight;
  }
}

/** Find the nearest scrollable ancestor (including shadow hosts). Returns null if none. */
export function findNearestScrollableAncestor(startEl) {
  if (!startEl) return null;
  const visited = new Set();
  const getHost = (n) => {
    try { return n?.getRootNode?.()?.host || null; } catch { return null; }
  };
  let node = startEl.parentNode || startEl.parentElement || getHost(startEl) || null;
  while (node && !visited.has(node)) {
    visited.add(node);
    if (node instanceof HTMLElement && isElementScrollableY(node)) return node;
    node = node.parentNode || node.parentElement || getHost(node) || null;
  }
  return null;
}
