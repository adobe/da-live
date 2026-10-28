export const extensionOf = (fileName) => (fileName?.includes('.') ? fileName.split('.').pop().toLowerCase() : '');

const MEDIA_BUS_PREFIX = './media_';
const UNSAFE_MEDIA_BUS_CHARS = /[\s<>"']/;
const WEB_PROTOCOLS = ['http:', 'https:'];

function parseHref(href, base) {
  try {
    return new URL(href, base);
  } catch {
    return undefined;
  }
}

const isWebHref = (href) => WEB_PROTOCOLS.includes(parseHref(href)?.protocol);

const isMediaBusHref = (href) => href.startsWith(MEDIA_BUS_PREFIX)
  && !UNSAFE_MEDIA_BUS_CHARS.test(href);

export function isAssetHref(href) {
  if (typeof href !== 'string' || !href.trim()) return false;
  return isMediaBusHref(href) || isWebHref(href);
}

function resolvePreviewHref({ href, previewOrigin }) {
  if (isWebHref(href)) return href;
  return previewOrigin ? parseHref(href, `${previewOrigin}/`)?.href : undefined;
}

export const ASSET_KINDS = Object.freeze({ image: 'image', file: 'file' });

// The same extensions the SDK writes as `<img>`, so the field previews exactly what is
// delivered as an image. Every other value is written as a link.
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg']);

const isImageHref = (href) => IMAGE_EXTENSIONS.has(
  extensionOf(href.trim().split(/[?#]/)[0].split('/').pop()),
);

function fileNameFromHref(href) {
  const lastSegment = href.split(/[?#]/)[0].split('/').pop();
  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
}

// Describes a stored asset value for display, with its name, its kind and the URL to preview.
// Only images have a preview.
export function describeAsset({ href, name, previewOrigin }) {
  if (!isAssetHref(href)) {
    return { name: name || '', kind: ASSET_KINDS.file, previewHref: undefined };
  }
  const isImage = isImageHref(href);
  return {
    name: name || fileNameFromHref(href),
    kind: isImage ? ASSET_KINDS.image : ASSET_KINDS.file,
    previewHref: isImage ? resolvePreviewHref({ href, previewOrigin }) : undefined,
  };
}

function decodeForDisplay(href) {
  try {
    return decodeURI(href);
  } catch {
    return href;
  }
}

// Splits a URL for display into the path before its file name, the file name's stem and the
// tail with its extension and query. Long URLs are cut in that order, so the extension stays.
export function splitHrefForDisplay(href) {
  const text = decodeForDisplay(href);
  const queryStart = text.search(/[?#]/);
  const pathEnd = queryStart === -1 ? text.length : queryStart;
  const stemStart = text.lastIndexOf('/', pathEnd - 1) + 1;
  const dot = text.lastIndexOf('.', pathEnd - 1);
  const tailStart = dot > stemStart ? dot : pathEnd;
  return {
    base: text.slice(0, stemStart),
    stem: text.slice(stemStart, tailStart),
    tail: text.slice(tailStart),
  };
}
