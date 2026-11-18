/**
 * The link protocols that run scripts, or open local programs.
 */
// eslint-disable-next-line no-script-url
const BLOCKED_PROTOCOLS = new Set(['javascript:', 'data:', 'vbscript:', 'search:', 'search-ms:']);

const isBlocked = (protocol) => BLOCKED_PROTOCOLS.has(protocol) || protocol.startsWith('ms-');

// A relative link has no protocol of its own, so the URL parser rejects it.
function absoluteUrl(href) {
  try {
    return new URL(href);
  } catch {
    return null;
  }
}

/** Returns the trimmed link, or null when it is empty or can run script or local programs. */
export function safeHref(href) {
  const trimmed = typeof href === 'string' ? href.trim() : '';
  if (!trimmed) {
    return null;
  }

  const url = absoluteUrl(trimmed);
  return url && isBlocked(url.protocol) ? null : trimmed;
}
