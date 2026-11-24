/** The protocols of the URLs an asset field previews. */
const WEB_PROTOCOLS = ['http:', 'https:'];

/** Finds where the path of a URL ends and its query or fragment starts. */
const QUERY_OR_FRAGMENT = /[?#]/;

/**
 * Reads the lowercase extension of a file name.
 * @param {string} [fileName] The file name.
 * @returns {string} The extension without its dot, or an empty string.
 */
export function extensionOf(fileName) {
  if (!fileName?.includes('.')) {
    return '';
  }
  return fileName.split('.').pop().toLowerCase();
}

/**
 * Parses a URL without throwing.
 * @param {string} href The URL to parse.
 * @param {string} [base] The base that relative URLs resolve against.
 * @returns {URL|undefined} The parsed URL, or undefined when it is invalid.
 */
function parseHref(href, base) {
  try {
    return new URL(href, base);
  } catch {
    return undefined;
  }
}

/**
 * Reads the last path segment of a URL, without its query and fragment.
 * @param {string} href The URL.
 * @returns {string} The last path segment.
 */
function lastPathSegment(href) {
  return href.split(QUERY_OR_FRAGMENT)[0].split('/').pop();
}

/**
 * Resolves the URL an image previews from. Media bus paths only load from the site's
 * preview origin.
 * @param {object} options The asset reference.
 * @param {string} options.href The stored asset URL.
 * @param {string} [options.previewOrigin] The site's preview origin.
 * @returns {string|undefined} The preview URL, or undefined while the origin is unknown
 *   or for a value that is no web URL.
 */
function resolvePreviewHref({ href, previewOrigin }) {
  const url = parseHref(href, previewOrigin ? `${previewOrigin}/` : undefined);
  return WEB_PROTOCOLS.includes(url?.protocol) ? url.href : undefined;
}

/**
 * Reads the decoded file name of a URL.
 * @param {string} href The URL.
 * @returns {string} The file name, or its encoded form when it cannot be decoded.
 */
function fileNameFromHref(href) {
  const segment = lastPathSegment(href);
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Describes a stored asset value for display. The SDK validates the value, so this only
 * reads it.
 * @param {object} options The asset reference.
 * @param {string} [options.href] The stored asset URL.
 * @param {string} [options.name] The file name known from the selection.
 * @param {string} [options.previewOrigin] The site's preview origin.
 * @returns {{ name: string, previewHref: (string|undefined) }} The asset's display name
 *   and the URL to preview.
 */
export function describeAsset({ href, name, previewOrigin }) {
  if (!href) {
    return { name: name || '', previewHref: undefined };
  }
  return {
    name: name || fileNameFromHref(href),
    previewHref: resolvePreviewHref({ href, previewOrigin }),
  };
}

/**
 * Decodes a URL for display without throwing.
 * @param {string} href The URL.
 * @returns {string} The decoded URL, or the URL itself when it cannot be decoded.
 */
function decodeForDisplay(href) {
  try {
    return decodeURI(href);
  } catch {
    return href;
  }
}

/**
 * Splits a URL for display into the path before its file name, the file name's stem and
 * the tail with its extension and query. Long URLs are cut in that order, so the
 * extension stays visible.
 * @param {string} href The URL.
 * @returns {{ base: string, stem: string, tail: string }} The decoded URL parts.
 */
export function splitHrefForDisplay(href) {
  const text = decodeForDisplay(href);
  const queryStart = text.search(QUERY_OR_FRAGMENT);
  const pathEnd = queryStart === -1 ? text.length : queryStart;
  const stemStart = text.lastIndexOf('/', pathEnd - 1) + 1;
  const dotIndex = text.lastIndexOf('.', pathEnd - 1);
  const tailStart = dotIndex > stemStart ? dotIndex : pathEnd;
  return {
    base: text.slice(0, stemStart),
    stem: text.slice(stemStart, tailStart),
    tail: text.slice(tailStart),
  };
}
