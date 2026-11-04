/** The link schemes that cannot run code. The SC SDK keeps the same ones when it saves. */
const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

/**
 * Checks that a link is relative or uses a safe scheme.
 * @param {unknown} href The link.
 * @returns {string|null} The trimmed link when it is safe, otherwise null.
 */
export function safeHref(href) {
  const trimmed = typeof href === 'string' ? href.trim() : '';
  // Browsers ignore control characters and spaces when they read the scheme.
  // eslint-disable-next-line no-control-regex
  const scheme = trimmed.replace(/[\u0000-\u0020]/g, '').match(/^([a-z][a-z0-9+.-]*):/i)?.[1];
  if (!trimmed || (scheme && !SAFE_SCHEMES.has(scheme.toLowerCase()))) {
    return null;
  }
  return trimmed;
}
