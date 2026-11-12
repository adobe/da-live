/** The link protocols that cannot run code. */
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

// A relative link has no protocol of its own, so the URL parser rejects it.
function absoluteUrl(href) {
  try {
    return new URL(href);
  } catch {
    return null;
  }
}

/** Returns the trimmed link when it is relative or uses a safe protocol, otherwise null. */
export function safeHref(href) {
  const trimmed = typeof href === 'string' ? href.trim() : '';
  if (!trimmed) {
    return null;
  }

  const url = absoluteUrl(trimmed);
  return !url || SAFE_PROTOCOLS.has(url.protocol) ? trimmed : null;
}
