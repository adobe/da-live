/** Sets keyboard focus on an element without scrolling. */
export default function focusElement(id, registry, options = {}) {
  if (!id || !registry) return;

  const element = registry.get(id);
  if (!element) return;

  const preventScroll = options.preventScroll !== false;
  element.focus({ preventScroll });
}
