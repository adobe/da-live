import { SUPPORTED_IMAGE_TYPES } from '../../../shared/constants.js';
import { daFetch } from '../../../shared/utils.js';
import { daRsSourceUrl, discoverDaRs, isDaRsBinding } from '../../../shared/da-rs-provider.js';
import { MEDIA_PLACEHOLDER } from '../../../shared/branch-selector/branch-media.js';

// Never expose an authored URL to the browser before validation.
export function createDaRsImageView(node) {
  const image = document.createElement('img');
  const render = (next) => {
    const source = next.attrs.src || '';
    if (image.dataset.daRsSource !== source) {
      image.dataset.daRsSource = source;
      image.src = source.startsWith('/blocks/edit/img/fpo.svg')
        ? '/blocks/edit/img/fpo.svg' : MEDIA_PLACEHOLDER;
    }
    ['alt', 'title', 'width', 'height'].forEach((name) => {
      if (next.attrs[name]) image.setAttribute(name, next.attrs[name]);
      else image.removeAttribute(name);
    });
  };
  render(node);
  return {
    dom: image,
    update(next) {
      if (next.type !== node.type) return false;
      render(next);
      return true;
    },
    ignoreMutation: () => true,
  };
}

// Render only locally stored media, retaining the relative URL in the document.
export function createDaRsMediaRenderer(context) {
  const { hash, search } = window.location;
  const parts = hash.startsWith('#/') ? hash.slice(2).split('/') : [];
  const doc = String(context.path || '').replace(/^\//, '').replace(/\.html$/i, '');
  const hashDoc = parts.join('/').replace(/\.html$/i, '');
  const valid = parts[0] === context.org && parts[1] === context.repo && doc === hashDoc;
  const images = new Map();
  let disposed = false;
  const current = () => valid && !disposed && isDaRsBinding()
    && window.location.hash === hash && window.location.search === search;

  function release(image, item) {
    item.controller.abort();
    if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
    images.delete(image);
  }

  async function load(view, image, item, name) {
    try {
      const binding = await discoverDaRs(context.org, context.repo);
      if (!current()) return;
      const parent = parts.slice(2, -1).join('/');
      const url = daRsSourceUrl(binding, `/${parent ? `${parent}/` : ''}${name}`);
      const response = await daFetch(url, { signal: item.controller.signal, noRedirect: true, redirect: 'error' });
      const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      if (!response.ok || response.redirected || (response.url && response.url !== url)
        || !SUPPORTED_IMAGE_TYPES.includes(type)) return;
      const blob = await response.blob();
      if (!current() || item.controller.signal.aborted
        || images.get(image) !== item || !view.dom.contains(image)) return;
      item.objectUrl = URL.createObjectURL(new Blob([blob], { type }));
      image.src = item.objectUrl;
    } catch { /* Leave a placeholder; never use delivery as a fallback. */ }
  }

  function update(view) {
    const present = new Set(view.dom.querySelectorAll('img'));
    images.forEach((item, image) => {
      const src = image.dataset.daRsSource || image.getAttribute('src');
      if (!present.has(image) || !current()
        || (src !== item.original && src !== item.objectUrl && src !== MEDIA_PLACEHOLDER)) {
        release(image, item);
      } else if (src === item.original) image.src = item.objectUrl || MEDIA_PLACEHOLDER;
    });
    present.forEach((image) => {
      if (images.has(image)) return;
      const original = image.dataset.daRsSource || image.getAttribute('src');
      if (!/^\.\/media_[a-z0-9_-]+\.[a-z0-9]+$/i.test(original || '')) return;
      image.src = MEDIA_PLACEHOLDER;
      if (!current()) return;
      const item = { original, controller: new AbortController(), objectUrl: null };
      images.set(image, item);
      load(view, image, item, original.slice(2));
    });
  }

  const invalidate = () => {
    if (current()) return;
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
      invalidate();
    },
  };
}
