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
  } catch {}
  return active;
}


