import { SUPPORTED_IMAGE_TYPES } from '../../shared/constants.js';

export const LIMITS = Object.freeze({
  maxHtmlBytes: 2 * 1024 * 1024,
  maxNodes: 20000,
  maxDepth: 64,
  maxImages: 100,
  maxReferences: 500,
  maxText: 20000,
  maxLabel: 200,
});

export class ImportedPageError extends Error {
  constructor(message, code = 'invalid-page') {
    super(message);
    this.code = code;
  }
}

const CARD_TAGS = ['section', 'header', 'div', 'dl', 'details', 'summary'];
const TAGS = new Set([
  ...CARD_TAGS, 'dt', 'dd', 'p', 'span', 'code', 'pre', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'u', 's', 'sub', 'sup', 'small', 'br', 'hr', 'figure', 'figcaption',
  'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'picture', 'img', 'a',
]);
// Dropped together with their content; everything else unknown is unwrapped to its text/children.
const DROP = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'template', 'noscript', 'svg', 'math',
  'form', 'input', 'button', 'textarea', 'select', 'option', 'link', 'meta', 'base', 'title', 'head',
  'audio', 'video', 'source', 'track', 'canvas', 'applet', 'dialog', 'slot', 'portal',
]);
const TRANSPARENT = new Set(['html', 'body', 'main']);

const CLASS_BY_TAG = {
  section: /^aem-component(?: aem-component--[a-z0-9-]{1,40})?$/,
  header: /^aem-component__header$/,
  summary: /^aem-component__header$/,
  dl: /^aem-component__properties$/,
  div: /^aem-component__(?:content|children)$/,
  p: /^aem-empty-page$/,
};
const ID = /^[A-Za-z][\w-]{0,63}$/;
const META_VALUE = /^[\w .,:;%/|=+-]{0,256}$/;
const NUMBER = /^\d{1,4}$/;
const REF_KINDS = ['page', 'sheet', 'image'];

const clean = (value, max) => value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function safeImagePath(path) {
  return typeof path === 'string' && path.startsWith('/content/dam/') && path.length <= 2048
    && !/[\\?#\p{Cc}\p{Cs}]/u.test(path) && !path.endsWith('/')
    && !path.split('/').slice(1).some((part) => !part || part === '.' || part === '..');
}

// Canonical decoded DA fullpath: /org/site/alias... — never a URL, never reverse-parsed.
export function parseCanonicalPath(path) {
  if (typeof path !== 'string' || path.length > 2000 || !path.startsWith('/')) return null;
  const parts = path.slice(1).split('/');
  if (parts.length < 3 || parts.some((part) => !part || part === '.' || part === '..'
    || /[\\?#\p{Cc}\p{Cs}]/u.test(part))) return null;
  return { org: parts[0], site: parts[1], parts };
}

function validIdentity(el, scope) {
  const kind = el.getAttribute('data-da-source-kind');
  const parsed = parseCanonicalPath(el.getAttribute('data-da-source-path'));
  if (!REF_KINDS.includes(kind) || !parsed) return null;
  if (parsed.org !== scope.org || parsed.site !== scope.site) return null;
  return { kind, path: `/${parsed.parts.join('/')}` };
}

function copyAttributes(src, out, tag) {
  const label = src.getAttribute('aria-label');
  if (label) out.setAttribute('aria-label', clean(label, 200));
  const labelledby = src.getAttribute('aria-labelledby');
  if (labelledby && ID.test(labelledby)) out.setAttribute('aria-labelledby', labelledby);
  const id = src.getAttribute('id');
  if (id && ID.test(id)) out.setAttribute('id', id);
  const cls = src.getAttribute('class')?.trim().replace(/\s+/g, ' ');
  if (cls && CLASS_BY_TAG[tag]?.test(cls)) out.setAttribute('class', cls);
  if (tag === 'p' && out.className === 'aem-empty-page' && src.getAttribute('role') === 'note') {
    out.setAttribute('role', 'note');
  }
  [...src.attributes].forEach(({ name, value }) => {
    if (/^data-aem-(?:in-between|(?:image-)?crop[a-z-]{0,30})$/.test(name) && META_VALUE.test(value)) {
      out.setAttribute(name, value);
    }
  });
  if (['th', 'td'].includes(tag)) {
    ['colspan', 'rowspan'].forEach((name) => {
      const value = src.getAttribute(name);
      if (value && NUMBER.test(value)) out.setAttribute(name, value);
    });
  }
}

// Reconstructs a trusted tree from untrusted markup: nothing is copied by reference and
// every element/attribute/class is created from an explicit allowlist.
export function sanitizeImportedPage(html, scope) {
  if (typeof html !== 'string') throw new ImportedPageError('Imported page has no content.');
  const source = new DOMParser().parseFromString(html, 'text/html');
  const out = document.implementation.createHTMLDocument('');
  const images = new Map();
  const references = new Map();
  let nodes = 0;

  const count = () => {
    nodes += 1;
    if (nodes > LIMITS.maxNodes) {
      throw new ImportedPageError('Imported page is too large to display.', 'too-many-nodes');
    }
  };

  function addReference(identity, label) {
    const key = `${identity.kind}:${identity.path}`;
    if (!references.has(key)) {
      if (references.size >= LIMITS.maxReferences) return null;
      references.set(key, { id: `ref-${references.size}`, reference: { ...identity, label: label || identity.path } });
    }
    return references.get(key).id;
  }

  function convertImage(el, parent) {
    const identity = validIdentity(el, scope);
    const alt = clean(el.getAttribute('alt') || '', LIMITS.maxLabel);
    const img = out.createElement('img');
    img.setAttribute('alt', alt);
    ['width', 'height'].forEach((name) => {
      const value = el.getAttribute(name);
      if (value && NUMBER.test(value)) img.setAttribute(name, value);
    });
    copyAttributes(el, img, 'img');
    const fallback = el.getAttribute('data-aem-image-path');
    if (safeImagePath(fallback)) img.setAttribute('data-aem-image-path', fallback);
    if (identity?.kind === 'image') {
      if (!images.has(identity.path) && images.size < LIMITS.maxImages) {
        images.set(identity.path, `img-${images.size}`);
      }
      const id = images.get(identity.path);
      if (id) img.setAttribute('data-img-id', id);
    }
    parent.append(img);
  }

  function walk(node, parent, depth) {
    if (depth > LIMITS.maxDepth) throw new ImportedPageError('Imported page is nested too deeply.', 'too-deep');
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        count();
        if (child.data) parent.append(out.createTextNode(child.data.slice(0, LIMITS.maxText)));
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const tag = child.localName;
      if (DROP.has(tag)) return;
      count();
      const identity = tag === 'img' ? null : validIdentity(child, scope);
      const refId = identity && identity.kind !== 'image'
        ? addReference(identity, clean(child.textContent, LIMITS.maxLabel)) : null;
      if (tag === 'img') {
        convertImage(child, parent);
        return;
      }
      if (tag === 'picture') {
        const picture = out.createElement('picture');
        parent.append(picture);
        child.querySelectorAll(':scope > img').forEach((img) => {
          count();
          convertImage(img, picture);
        });
        return;
      }
      if (tag === 'a' || !TAGS.has(tag)) {
        // Anchors are neutralized; unknown wrappers keep only their safe children.
        const holder = tag === 'a' ? out.createElement('span') : parent;
        if (tag === 'a') {
          holder.setAttribute('class', identity ? 'aem-ref' : 'aem-link');
          if (refId) holder.setAttribute('data-ref-id', refId);
          parent.append(holder);
        }
        walk(child, holder, depth + 1);
        return;
      }
      if (TRANSPARENT.has(tag)) {
        walk(child, parent, depth + 1);
        return;
      }
      const el = out.createElement(tag);
      copyAttributes(child, el, tag);
      parent.append(el);
      if (tag !== 'br' && tag !== 'hr') walk(child, el, depth + 1);
    });
  }

  const body = out.createElement('div');
  walk(source.body, body, 0);
  return {
    root: body,
    images: [...images].map(([path, id]) => ({ path, id })),
    references: [...references.values()].map(({ reference }) => reference),
  };
}

// Rebuild Author HTML into an inert tree. Only same-page Core Image paths can be hydrated;
// scripts, forms, author URLs and event handlers are never copied into the viewer.
export function sanitizeAuthorPage(html) {
  if (typeof html !== 'string') throw new ImportedPageError('Imported page has no content.');
  const source = new DOMParser().parseFromString(html, 'text/html');
  const out = document.implementation.createHTMLDocument('');
  const root = out.createElement('div');
  const images = new Map();
  let styleCount = 0;
  let styleBytes = 0;
  const safeCss = (value) => value.length <= 65536 && !/[<>\\]/.test(value)
    && !/(?:url\s*\(|expression\s*\(|@import)/i.test(value);
  source.querySelectorAll('style').forEach((style) => {
    const text = style.textContent || '';
    if (styleCount >= 32 || styleBytes + text.length > 262144 || !safeCss(text)) return;
    styleCount += 1;
    styleBytes += text.length;
    const copy = out.createElement('style');
    copy.textContent = text;
    root.append(copy);
  });
  let nodes = 0;
  const count = () => {
    nodes += 1;
    if (nodes > LIMITS.maxNodes) throw new ImportedPageError('Imported page is too large to display.', 'too-many-nodes');
  };
  function walk(node, parent, depth) {
    if (depth > LIMITS.maxDepth) throw new ImportedPageError('Imported page is nested too deeply.', 'too-deep');
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        count();
        parent.append(out.createTextNode(child.data.slice(0, LIMITS.maxText)));
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const tag = child.localName;
      if (DROP.has(tag)) return;
      count();
      if (tag === 'img') {
        const img = out.createElement('img');
        img.alt = clean(child.getAttribute('alt') || '', LIMITS.maxLabel);
        const src = child.getAttribute('src') || '';
        if (src.length <= 2048 && /^\/content\/[A-Za-z0-9_./ -]+\/_jcr_content\/[A-Za-z0-9_./ -]+\.coreimg\.(?:jpeg|png|webp)\/[0-9]+\/[A-Za-z0-9_.-]+$/.test(src)
          && !src.split('/').some((part) => part === '.' || part === '..')) {
          if (!images.has(src) && images.size < LIMITS.maxImages) images.set(src, `img-${images.size}`);
          const id = images.get(src);
          if (id) img.setAttribute('data-img-id', id);
        }
        parent.append(img);
        return;
      }
      if (tag === 'a' || !TAGS.has(tag) || TRANSPARENT.has(tag)) {
        walk(child, parent, depth + 1);
        return;
      }
      const el = out.createElement(tag);
      const cls = child.getAttribute('class') || '';
      if (/^[A-Za-z0-9_ -]{1,512}$/.test(cls)) el.className = cls;
      const style = child.getAttribute('style');
      if (style && safeCss(style)) el.setAttribute('style', style);
      copyAttributes(child, el, tag);
      parent.append(el);
      if (tag !== 'br' && tag !== 'hr') walk(child, el, depth + 1);
    });
  }
  walk(source.body, root, 0);
  return { root, images: [...images].map(([path, id]) => ({ path, id })) };
}

// 64 MiB of unique image bytes become at most ~85.34 MiB of base64 plus small MIME prefixes.
// Cap all serialized image URLs too: repeated image nodes duplicate their data in srcdoc.
const MAX_INLINE_IMAGE_CHARS = 86 * 1024 * 1024;

// Applies only viewer-generated data URLs, never any src from authored HTML.
export function serializeImportedPage(root, dataUrls, maxImageChars, routes = new Map()) {
  let remaining = maxImageChars === undefined ? MAX_INLINE_IMAGE_CHARS : maxImageChars;
  const allowed = new Map();
  dataUrls.forEach((url, id) => {
    if (url && url.length <= remaining
      && SUPPORTED_IMAGE_TYPES.some((type) => url.startsWith(`data:${type};base64,`))) {
      remaining -= url.length;
      allowed.set(id, url);
    }
  });
  const emitted = new Set();
  const clone = root.cloneNode(true);
  clone.querySelectorAll('span[data-ref-id]').forEach((span) => {
    const href = routes.get(span.getAttribute('data-ref-id'));
    span.removeAttribute('data-ref-id');
    if (!href) return;
    const link = clone.ownerDocument.createElement('a');
    link.setAttribute('class', 'aem-ref');
    link.setAttribute('href', href);
    link.setAttribute('target', '_top');
    link.append(...span.childNodes);
    span.replaceWith(link);
  });
  clone.querySelectorAll('img').forEach((img) => {
    const id = img.getAttribute('data-img-id');
    const url = allowed.get(id);
    const fallback = img.getAttribute('data-aem-image-path');
    img.removeAttribute('data-img-id');
    img.removeAttribute('data-aem-image-path');
    // Reserve room for each distinct image before spending what's left on repetitions.
    const repeat = emitted.has(id);
    if (url && (!repeat || url.length <= remaining)) {
      if (repeat) remaining -= url.length;
      emitted.add(id);
      img.setAttribute('src', url);
      img.setAttribute('loading', 'eager');
      return;
    }
    const note = clone.ownerDocument.createElement('span');
    note.setAttribute('class', 'aem-image-placeholder');
    note.textContent = fallback || `Image unavailable${img.getAttribute('alt') ? `: ${img.getAttribute('alt')}` : ''}`;
    img.replaceWith(note);
  });
  return clone.innerHTML;
}
