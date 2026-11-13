import { LINKED_ASSET_TYPE, deliveredAssetType } from './asset-types.js';

/** The start of every relative media bus path the site serves uploaded images from. */
const MEDIA_BUS_PREFIX = './media_';

/** Characters that would break the stored value out of its HTML attribute. */
const UNSAFE_MEDIA_BUS_CHARACTERS = /[\s<>"']/;

/** The protocols of absolute URLs an asset field accepts. */
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
 * Checks whether a URL is an absolute web URL.
 * @param {string} href The URL.
 * @returns {boolean} Whether the URL is absolute and uses http or https.
 */
function isWebHref(href) {
  return WEB_PROTOCOLS.includes(parseHref(href)?.protocol);
}

/**
 * Checks whether a URL is a media bus path that can be stored as it is.
 * @param {string} href The URL.
 * @returns {boolean} Whether the URL is a media bus path that is safe to store.
 */
function isMediaBusHref(href) {
  return href.startsWith(MEDIA_BUS_PREFIX) && !UNSAFE_MEDIA_BUS_CHARACTERS.test(href);
}

/**
 * Finds the asset type the SDK delivers a URL as, by the extension of its file name.
 * @param {string} href The URL.
 * @returns {import('./asset-types.js').AssetType} The asset type the URL is delivered as.
 */
function deliveredAssetTypeOfHref(href) {
  return deliveredAssetType(extensionOf(lastPathSegment(href.trim())));
}

/**
 * Checks whether a value can be stored in an asset field.
 * @param {unknown} href The value to check.
 * @returns {boolean} Whether the value is a media bus path or a web URL.
 */
export function isAssetHref(href) {
  if (typeof href !== 'string' || !href.trim()) {
    return false;
  }
  return isMediaBusHref(href) || isWebHref(href);
}

/**
 * Resolves the URL an image previews from. Media bus paths only load from the site's
 * preview origin.
 * @param {object} options The asset reference.
 * @param {string} options.href The stored asset URL.
 * @param {string} [options.previewOrigin] The site's preview origin.
 * @returns {string|undefined} The preview URL, or undefined while the origin is unknown.
 */
function resolvePreviewHref({ href, previewOrigin }) {
  if (isWebHref(href)) {
    return href;
  }
  if (!previewOrigin) {
    return undefined;
  }
  return parseHref(href, `${previewOrigin}/`)?.href;
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
 * Describes a stored asset value for display. Only asset types that show a preview have
 * a preview URL.
 * @param {object} options The asset reference.
 * @param {string} [options.href] The stored asset URL.
 * @param {string} [options.name] The file name known from the selection.
 * @param {string} [options.previewOrigin] The site's preview origin.
 * @returns {{ name: string, assetType: string, previewHref: (string|undefined) }} The
 *   asset's display name, the name of the asset type it is delivered as, and the
 *   URL to preview.
 */
export function describeAsset({ href, name, previewOrigin }) {
  if (!isAssetHref(href)) {
    return { name: name || '', assetType: LINKED_ASSET_TYPE.name, previewHref: undefined };
  }

  const assetType = deliveredAssetTypeOfHref(href);
  return {
    name: name || fileNameFromHref(href),
    assetType: assetType.name,
    previewHref: assetType.showsPreview ? resolvePreviewHref({ href, previewOrigin }) : undefined,
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
