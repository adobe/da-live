import { getNx2Api } from '../../../scripts/utils.js';
import { SUPPORTED_IMAGE_TYPES } from '../../shared/constants.js';
import { discoverDaRsCapabilities, siteItemCapabilities } from '../../shared/da-rs-provider.js';
import { isDaRsSelected } from '../../shared/da-rs-bootstrap.js';
import { encodeDaRsAliasPath } from '../../shared/da-rs-alias-path.js';
import { withDaRsBinding } from '../../shared/da-rs-navigation.js';
import { LIMITS, ImportedPageError, sanitizeImportedPage, sanitizeAuthorPage, serializeImportedPage } from './sanitize.js';
import { FRAME_CSP, FRAME_CSS, PARENT_CSS } from './styles.js';

export const IMAGE_LIMITS = Object.freeze({
  concurrency: 4,
  maxImageBytes: 10 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
});
// Test seam: capability discovery and the authenticated Source client.
export const routeDeps = {
  discover: (org, site) => discoverDaRsCapabilities(org, site),
  source: async () => (await getNx2Api()).source,
};

const MARK = 'data-imported-page';
let active;
let styled = false;

function ensureStyles() {
  if (styled) return;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(PARENT_CSS);
  document.adoptedStyleSheets.push(sheet);
  styled = true;
}

// Returns capabilities only when this route is an openable, unbranched imported Page.
export async function findImportedPageCaps(details) {
  try {
    const { org, site } = details || {};
    if (!org || !site || site.includes('~') || !isDaRsSelected()) return null;
    if (!/\.html$/.test(details.fullpath || '')) return null;
    const caps = await routeDeps.discover(org, site);
    if (caps?.contentProfile !== 'aem-import') return null;
    return siteItemCapabilities(caps, 'page', []).view === 'page-readonly' ? caps : null;
  } catch {
    return null;
  }
}

export function unmountImportedPage(el) {
  active?.cleanup();
  active = undefined;
  el.querySelectorAll(`[${MARK}]`).forEach((node) => node.remove());
}

export function validatePageResponse(resp) {
  if (!resp?.ok) {
    if (resp?.status === 401) throw new ImportedPageError('Sign in required');
    if (resp?.status === 403) throw new ImportedPageError('You do not have permission to view this page.');
    throw new ImportedPageError(`Unable to open imported page (${resp?.status ?? 'no response'}).`);
  }
  const header = (name) => resp.headers?.get(name)?.trim();
  if (header('x-da-content-profile') !== 'aem-import'
    || header('x-da-source-kind') !== 'page'
    || header('x-da-source-collaboration') !== 'false') {
    throw new ImportedPageError('This content is not an imported read-only page.');
  }
  const type = header('content-type') ?? '';
  if (!/^text\/html\s*(;|$)/i.test(type) || /charset\s*=\s*(?!"?utf-8"?\s*(;|$))/i.test(type)) {
    throw new ImportedPageError('Imported page has an unsupported content type.');
  }
  const length = Number(header('content-length'));
  if (length > LIMITS.maxHtmlBytes) throw new ImportedPageError('Imported page is too large to display.');
}

// Reads at most `max` bytes: the stream is cancelled as soon as the limit is crossed or the
// signal aborts, so a missing or lying Content-Length never leads to an unbounded buffer.
export async function readBounded(resp, max, { signal, code = 'too-large' } = {}) {
  const tooLarge = () => new ImportedPageError('Imported content is too large to display.', code);
  if (Number(resp.headers?.get('content-length')) > max) {
    await resp.body?.cancel?.().catch(() => {});
    throw tooLarge();
  }
  const reader = resp.body?.getReader?.();
  if (!reader) {
    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (bytes.byteLength > max) throw tooLarge();
    return bytes;
  }
  const chunks = [];
  let total = 0;
  const abort = () => reader.cancel().catch(() => {});
  signal?.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      if (signal?.aborted) throw new ImportedPageError('Request aborted.', 'aborted');
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        // eslint-disable-next-line no-await-in-loop
        await reader.cancel().catch(() => {});
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    signal?.removeEventListener('abort', abort);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return out;
}

async function readPage(resp, signal) {
  validatePageResponse(resp);
  const bytes = await readBounded(resp, LIMITS.maxHtmlBytes, { signal, code: 'html-too-large' });
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ImportedPageError('Imported page is not valid UTF-8.', 'invalid-encoding');
  }
}

async function fetchImage(source, path, { signal, maxBytes, authorPage }) {
  const resp = authorPage
    ? await source.get(authorPage, undefined, { signal, render: 'author-image', resource: path })
    : await source.get(path, undefined, { signal });
  if (!resp?.ok) return null;
  const type = resp.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (resp.headers.get('x-da-content-profile') !== 'aem-import'
    || resp.headers.get('x-da-source-kind') !== 'image'
    || resp.headers.get('x-da-source-collaboration') !== 'false'
    || !SUPPORTED_IMAGE_TYPES.includes(type)) {
    await resp.body?.cancel?.().catch(() => {});
    return null;
  }
  try {
    const bytes = await readBounded(resp, maxBytes, { signal, code: 'image-too-large' });
    return bytes.length ? new Blob([bytes], { type }) : null;
  } catch (error) {
    if (error instanceof ImportedPageError) return null;
    throw error;
  }
}

// Parent blob URLs cannot be loaded by the opaque srcdoc frame. Encode only validated bytes.
function imageDataUrl(blob, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    const abort = () => reader.abort();
    reader.addEventListener('loadend', () => {
      signal?.removeEventListener('abort', abort);
      resolve(reader.result);
    }, { once: true });
    reader.readAsDataURL(blob);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

// Bounded, concurrency-limited hydration. Failures become placeholders (null); never a direct URL.
export async function hydrateImages(images, options) {
  const { source, isCurrent, signal, authorPage } = options;
  const limits = options.limits ?? IMAGE_LIMITS;
  const result = new Map();
  let total = 0;
  const queue = [...images];
  const current = () => !signal?.aborted && isCurrent();
  const worker = async () => {
    while (queue.length && current()) {
      const { id, path } = queue.shift();
      let url = null;
      let reserved = 0;
      try {
        const maxBytes = Math.min(limits.maxImageBytes, limits.maxTotalBytes - total);
        const blob = maxBytes > 0
          ? await fetchImage(source, path, { signal, maxBytes, authorPage }) : null;
        if (blob && current() && total + blob.size <= limits.maxTotalBytes) {
          reserved = blob.size;
          total += reserved;
          url = await imageDataUrl(blob, signal);
        }
      } catch {
        url = null;
      }
      if (!current()) url = null;
      if (!url) total -= reserved;
      result.set(id, url);
    }
  };
  await Promise.all(Array.from({ length: limits.concurrency }, worker));
  return result;
}

function routeFor(caps, ref) {
  const kind = ref.kind === 'image' ? 'image' : ref.kind;
  const { view } = siteItemCapabilities(caps, kind, []);
  let route;
  let { path } = ref;
  if (kind === 'page' && view === 'page-readonly') route = '/edit#';
  else if (kind === 'sheet' && view === 'sheet-readonly') route = '/sheet#';
  else if (kind === 'image' && view === 'media') route = '/media#';
  else return null;
  if (kind === 'page') path = path.replace(/\.html$/, '');
  if (kind === 'sheet') path = path.replace(/\.json$/, '');
  try {
    return withDaRsBinding(`${route}${encodeDaRsAliasPath(path)}`);
  } catch {
    return null;
  }
}

function referenceList(references, caps) {
  const section = document.createElement('section');
  section.className = 'da-imported-page-references';
  section.setAttribute('aria-labelledby', 'da-imported-page-references-title');
  const title = document.createElement('h2');
  title.id = 'da-imported-page-references-title';
  title.textContent = 'Page references';
  const list = document.createElement('ul');
  references.forEach((ref) => {
    const item = document.createElement('li');
    const href = routeFor(caps, ref);
    const label = `${ref.kind}: ${ref.label}`;
    if (href) {
      const a = document.createElement('a');
      a.href = href;
      a.textContent = label;
      item.append(a);
    } else {
      item.textContent = `${label} (unavailable)`;
    }
    list.append(item);
  });
  if (!references.length) {
    const none = document.createElement('p');
    none.textContent = 'No linked pages, sheets or images.';
    section.append(title, none);
  } else {
    section.append(title, list);
  }
  return section;
}

export function buildSrcdoc(bodyHtml) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">
<style>${FRAME_CSS}</style></head><body>${bodyHtml}</body></html>`;
}

function buildFrame(bodyHtml, view = 'content') {
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-top-navigation-by-user-activation');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.setAttribute('title', view === 'layout' ? 'Author page layout' : 'Imported AEM page component inspection');
  frame.srcdoc = buildSrcdoc(bodyHtml);
  return frame;
}

function showError(container, message) {
  const p = document.createElement('p');
  p.className = 'da-imported-page-error';
  p.setAttribute('role', 'alert');
  p.textContent = message;
  container.replaceChildren(p);
}

export async function mountImportedPage({ el, details, caps, isCurrent }) {
  unmountImportedPage(el);
  ensureStyles();
  let pending;
  const state = { cleanup: () => pending?.abort() };
  active = state;
  const current = () => active === state && isCurrent();

  const daTitle = document.createElement('da-title');
  daTitle.setAttribute(MARK, '');
  daTitle.details = { parent: details.parent, parentName: details.parentName, name: details.name };
  daTitle.readOnly = true;
  const toolbar = document.createElement('div');
  toolbar.setAttribute(MARK, '');
  toolbar.className = 'da-imported-page-toolbar';
  const toggle = document.createElement('div');
  toggle.className = 'da-imported-page-segmented';
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', 'Editor view');
  const buttons = new Map();
  let loadView;
  ['layout', 'content'].forEach((view) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'da-imported-page-segment';
    button.textContent = view === 'layout' ? 'Layout' : 'Content';
    button.addEventListener('click', () => { loadView(view); });
    buttons.set(view, button);
    toggle.append(button);
  });
  toolbar.append(toggle);
  const container = document.createElement('div');
  container.setAttribute(MARK, '');
  container.className = 'da-imported-page';
  el.replaceChildren(daTitle, toolbar, container);
  document.title = `View page ${details.name} - DA`;

  loadView = async (view) => {
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    const viewCurrent = () => current() && pending === controller && !controller.signal.aborted;
    buttons.forEach((button, name) => {
      button.classList.toggle('is-selected', name === view);
      button.setAttribute('aria-pressed', String(name === view));
    });
    container.replaceChildren();
    try {
      const source = await routeDeps.source();
      const { signal } = controller;
      const options = view === 'layout' ? { signal, render: 'author' } : { signal };
      const text = await readPage(await source.get(details.fullpath, undefined, options), signal);
      if (!viewCurrent()) return;
      const scope = { org: details.org, site: details.site };
      const result = view === 'layout' ? sanitizeAuthorPage(text) : sanitizeImportedPage(text, scope);
      const authorPage = view === 'layout' ? details.fullpath : undefined;
      const imageOptions = { source, isCurrent: viewCurrent, signal, authorPage };
      const dataUrls = await hydrateImages(result.images, imageOptions);
      if (!viewCurrent()) return;
      const references = result.references || [];
      const routes = new Map(references.map((ref, index) => [`ref-${index}`, routeFor(caps, ref)]));
      const body = serializeImportedPage(result.root, dataUrls, undefined, routes);
      const frame = buildFrame(body, view);
      if (view === 'layout') container.replaceChildren(frame);
      else container.replaceChildren(frame, referenceList(references, caps));
    } catch (error) {
      if (!viewCurrent()) return;
      showError(container, error instanceof ImportedPageError ? error.message : 'Unable to open imported page.');
    }
  };
  await loadView('content');
}
