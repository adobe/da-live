/**
 * Focus an element by ID from registry.
 * @param {string} id - Element ID
 * @param {ElementRegistryController} registry - Element registry
 * @param {Object} options - Focus options
 * @param {boolean} options.preventScroll - Prevent scroll on focus (default: true)
 */
export function focusElement(id, registry, options = {}) {
  if (!id || !registry) return;

  const element = registry.get(id);
  if (!element) return;

  const preventScroll = options.preventScroll !== false;
  element.focus({ preventScroll });
}

