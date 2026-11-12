/** The link protocols that cannot run code. The SC SDK keeps the same ones when it saves. */
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * Reads a link as an absolute URL the way a browser does.
 * @param {string} href The link.
 * @returns {URL|null} The URL, or null when the link is relative to the page.
 */
function absoluteUrl(href) {
  try {
    return new URL(href);
  } catch {
    return null;
  }
}

/**
 * Checks that a link is relative or uses a safe protocol.
 * @param {unknown} href The link.
 * @returns {string|null} The trimmed link when it is safe, otherwise null.
 */
export function safeHref(href) {
  const trimmed = typeof href === 'string' ? href.trim() : '';
  if (!trimmed) {
    return null;
  }

  const url = absoluteUrl(trimmed);
  return !url || SAFE_PROTOCOLS.has(url.protocol) ? trimmed : null;
}
