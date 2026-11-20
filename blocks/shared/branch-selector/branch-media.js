import { sanitizePathParts } from '../../../scripts/utils.js';
import { DA_ORIGIN, SUPPORTED_IMAGE_TYPES } from '../constants.js';
import { daFetch } from '../utils.js';
import { branchContext } from './context.js';

export const MEDIA_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

const MEDIA_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
};

function forbiddenNameCharacters(name) {
  return /[/\\]|%[\da-f]{2}/i.test(name) || [...name].some((char) => {
    const code = char.codePointAt(0);
    return code < 32 || (code >= 127 && code <= 159);
  });
}

// Decode only once. Nested encodings and separators must never create a route.
function safeName(raw) {
  if (typeof raw !== 'string' || !raw) throw new TypeError('Invalid media name');
  let name;
  try { name = decodeURIComponent(raw.replace(/%(?![\da-f]{2})/gi, '%25')); } catch {
    throw new TypeError('Invalid media name');
  }
  if (!name || name === '.' || name === '..' || forbiddenNameCharacters(name)) {
    throw new TypeError('Invalid media name');
  }
  return name;
}

export function branchUploadTarget(path, body) {
  if (typeof path !== 'string' || !path.startsWith('/')) throw new TypeError('Invalid media path');
  const parts = path.split('/');
  const name = safeName(parts.pop());
  const page = parts.pop();
  if (!page || !page.startsWith('.') || page === '.' || page === '..') {
    throw new TypeError('Media upload must identify its document');
  }
  const type = (body?.type || '').split(';')[0].toLowerCase();
  const extension = MEDIA_EXTENSIONS[type] || name.match(/\.([a-z0-9]{1,10})$/i)?.[1]?.toLowerCase();
  if (!extension) throw new TypeError('Media upload requires a safe extension');
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const filename = `media_${id}.${extension}`;
  return { parent: [...parts, page].join('/'), path: `${parts.join('/')}/${filename}`, filename };
}

export function branchUploadMatchesDocument(parent, context, hash) {
  try {
    const active = branchContext(hash);
    if (!active || active.org !== context.org || active.siteSegment !== context.siteSegment) {
      return false;
    }
    const parts = sanitizePathParts(hash.slice(1));
    if (parts.length < 3 || !parts[parts.length - 1]) return false;
    const page = parts[parts.length - 1];
    const directory = parts.slice(2, -1).join('/');
    const prefix = directory ? `/${directory}/.` : '/.';
    const extensionlessPage = page.replace(/\.html$/i, '');
    return parent === `${prefix}${page}` || parent === `${prefix}${extensionlessPage}`;
  } catch {
    return false;
  }
}

// Compare decoded segments only after rejecting encoded separators and traversal.
function sourceSegments(path) {
  if (typeof path !== 'string' || !path.startsWith('/source/')
    || /[?#\\]|%2f|%5c|%25/i.test(path)) return null;
  try {
    const parts = path.split('/').map((part) => decodeURIComponent(part));
    if (parts.some((part) => part === '.' || part === '..' || forbiddenNameCharacters(part))) {
      return null;
    }
    return parts;
  } catch {
    return null;
  }
}

export function validBranchSourceResponse(payload, expectedPath) {
  const actual = sourceSegments(payload?.source?.sourceUrl);
  const expected = sourceSegments(expectedPath);
  return Boolean(actual && expected && actual.length === expected.length
    && actual.every((part, index) => part === expected[index])
    && !payload.aem);
}

export function validBranchUploadResponse(payload, expectedPath, filename) {
  return validBranchSourceResponse(payload, expectedPath)
    && payload?.source?.contentUrl === `./${filename}`;
}

function branchMediaUrl(context, hash, src) {
  const current = branchContext(hash);
  if (!current || current.org !== context.org || current.siteSegment !== context.repo) return null;
  if (!src?.startsWith('./media_')) return null;
  let name;
  const rawName = src.slice(2).split(/[?#]/, 1)[0];
  try { name = safeName(rawName); } catch {
    return null;
  }
  if (!name.startsWith('media_') || name.length <= 6) return null;
  const hashParts = sanitizePathParts(hash.slice(1));
  const docParts = String(context.path || '').replace(/^\//, '').split('/');
  if (hashParts.length < 3 || docParts.length !== hashParts.length) return null;
  const withoutHtml = (part) => part.replace(/\.html$/i, '');
  if (!hashParts.every((part, i) => (i === hashParts.length - 1
    ? withoutHtml(part) === withoutHtml(docParts[i]) : part === docParts[i]))) return null;
  const parent = hashParts.slice(2, -1).map(encodeURIComponent).join('/');
  return `${DA_ORIGIN}/source/${current.org}/${current.siteSegment}/${parent ? `${parent}/` : ''}${encodeURIComponent(name.toLowerCase())}`;
}

/** Display branch media without changing the ProseMirror document's relative src. */
export function createBranchMediaRenderer(context, fetcher = daFetch) {
  const { hash } = window.location;
  let branch;
  try { branch = branchContext(hash)?.branch; } catch { /* Invalid contexts stay hidden. */ }
  const images = new Map();
  let disposed = false;

  function release(image, item) {
    item.controller.abort();
    if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
    images.delete(image);
  }

  function current(view, image, item) {
    const src = image.getAttribute('src');
    return !disposed && !item.controller.signal.aborted && window.location.hash === hash
      && images.get(image) === item && view.dom.contains(image)
      && (src === item.original || src === MEDIA_PLACEHOLDER);
  }

  async function load(view, image, item, url) {
    try {
      const options = { method: 'GET', signal: item.controller.signal, noRedirect: true, redirect: 'error' };
      const response = await fetcher(url, options);
      const type = response.headers?.get('content-type')?.split(';')[0].trim().toLowerCase();
      if (!response.ok || !branch || response.headers?.get('content-branch') !== branch
        || response.redirected || (response.url && response.url !== url)
        || !SUPPORTED_IMAGE_TYPES.includes(type)) return;
      const blob = await response.blob();
      if (!current(view, image, item)) return;
      item.objectUrl = URL.createObjectURL(new Blob([blob], { type }));
      image.src = item.objectUrl;
    } catch { /* Leave a placeholder; never fall back to preview or Default. */ }
  }

  function update(view) {
    const present = new Set(view.dom.querySelectorAll('img'));
    images.forEach((item, image) => {
      const src = image.getAttribute('src');
      if (!present.has(image)
        || (src !== item.original && src !== item.objectUrl && src !== MEDIA_PLACEHOLDER)) {
        release(image, item);
      } else if (src === item.original) {
        image.src = item.objectUrl || MEDIA_PLACEHOLDER;
      }
    });
    present.forEach((image) => {
      if (images.has(image)) return;
      const original = image.getAttribute('src');
      if (!original?.startsWith('./media_')) return;
      let url;
      try { url = branchMediaUrl(context, hash, original); } catch {
        // Invalid context stays hidden.
      }
      image.src = MEDIA_PLACEHOLDER;
      if (!url || window.location.hash !== hash || disposed) return;
      const item = { original, controller: new AbortController(), objectUrl: null };
      images.set(image, item);
      load(view, image, item, url);
    });
  }

  const invalidate = () => {
    if (window.location.hash === hash) return;
    images.forEach((item, image) => {
      image.src = MEDIA_PLACEHOLDER;
      release(image, item);
    });
  };
  window.addEventListener('hashchange', invalidate);
  return {
    update,
    destroy() {
      disposed = true;
      window.removeEventListener('hashchange', invalidate);
      images.forEach((item, image) => {
        image.src = MEDIA_PLACEHOLDER;
        release(image, item);
      });
    },
  };
}
