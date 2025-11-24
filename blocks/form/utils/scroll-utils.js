/**
 * Utility functions for scrolling and visibility checks.
 */
export function getRect(el) {
  return el?.getBoundingClientRect?.() || {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    height: 0,
    width: 0,
  };
}

/**
 * Returns true if the element is fully visible within the container's viewport.
 * When container is the page, pass the scrolling element/window bounds explicitly,
 * but for component hosts with overflow: auto, pass the host element as container.
 */
export function isVisibleWithin(container, el, margin = 0) {
  if (!container || !el) return false;
  const c = getRect(container);
  const r = getRect(el);
  return (r.top >= c.top + margin) && (r.bottom <= c.bottom - margin);
}

/**
 * Scroll the container so that el is visible (center by default).
 * If onlyIfNeeded is true, does nothing when already visible.
 * Container should be the scroll container element (e.g., :host with overflow: auto).
 */
export function scrollWithin(container, el, options = {}, flags = {}) {
  if (!container || !el || typeof el.scrollIntoView !== 'function') return;
  const { behavior = 'smooth', block = 'center', inline = 'nearest' } = options;
  const { onlyIfNeeded = true, margin = 0 } = flags;
  if (!onlyIfNeeded || !isVisibleWithin(container, el, margin)) {
    el.scrollIntoView({ behavior, block, inline });
  }
}

/**
 * Scroll the page to the element. Prefer relying on CSS scroll-margin-top to
 * account for sticky headers. The caller should ensure any CSS variables used
 * by scroll-margin-top are up to date.
 */
export function scrollPageTo(el, options = {}) {
  if (!el || typeof el.scrollIntoView !== 'function') return;
  const { behavior = 'smooth', block = 'start', inline = 'nearest' } = options;
  el.scrollIntoView({ behavior, block, inline });
}
