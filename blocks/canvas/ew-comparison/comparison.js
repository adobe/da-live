import { getNx, getNx2Api } from '../../../scripts/utils.js';
import { buildCompareDom } from '../../shared/version/compare.js';
import { canvasBus } from '../utils/canvas-bus.js';

const CONTENT_TAGS = new Set('a p h1 h2 h3 h4 h5 h6 div span strong em b i u s del ins sub sup code pre blockquote ul ol li table thead tbody tfoot tr td th caption colgroup col br hr img figure figcaption'.split(' '));

export function comparisonContextKey(context) {
  const { org, site, path } = context || {};
  return org && site && typeof path === 'string'
    ? JSON.stringify([org, site, path.replace(/^\//, '').replace(/\.html$/, '')]) : null;
}

export function normalizeComparisonHtml(html, context) {
  const dom = new DOMParser().parseFromString(html, 'text/html');
  dom.querySelectorAll('script, style, iframe, object, embed, form, input, button, base, link, meta, template, svg, math').forEach((el) => el.remove());
  dom.querySelectorAll('div.tableWrapper').forEach((el) => el.replaceWith(...el.childNodes));
  [...dom.body.querySelectorAll('*')].reverse().forEach((el) => {
    if (!CONTENT_TAGS.has(el.localName)) el.replaceWith(...el.childNodes);
  });
  const base = `https://main--${context.site}--${context.org}.aem.live/${context.path.replace(/^\//, '').replace(/\.html$/, '')}`;
  dom.body.querySelectorAll('*').forEach((el) => {
    [...el.attributes].forEach(({ name, value }) => {
      if (!['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'start'].includes(name)) {
        el.removeAttribute(name);
      } else if (name === 'src' || name === 'href') {
        try {
          const url = new URL(value, base);
          if (!['https:', 'http:', ...(name === 'href' ? ['mailto:', 'tel:'] : [])].includes(url.protocol)) {
            el.removeAttribute(name);
          } else {
            url.hostname = url.hostname.replace(/\.(?:hlx|aem)\.(?:page|live)$/, '.aem.live');
            if (name === 'src' && url.hash.startsWith('#width')) url.hash = '';
            el.setAttribute(name, url.href);
          }
        } catch { el.removeAttribute(name); }
      }
    });
    if (el.localName === 'a' && el.hasAttribute('href')) {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
  });
  return dom.body.innerHTML;
}

export async function readDeliveredContent(partition, context, { api, convert } = {}) {
  const { aem } = api || await getNx2Api();
  const path = `/${context.path.replace(/^\//, '').replace(/\.html$/, '')}`;
  const resourcePath = `${path.endsWith('/') ? `${path}index` : path}.md`;
  const response = await (partition === 'live' ? aem.getPublish : aem.getPreview)({ org: context.org, site: context.site, path: resourcePath });
  if (partition === 'live' && response.status === 404) return { html: '', missing: true };
  if (!response.ok) throw new Error(`Could not load ${partition} content (${response.status}).`);
  const converter = convert || (await import(`${getNx().replace(/\/nx2$/, '/nx')}/utils/converters.js`)).mdToDocDom;
  return { html: converter(await response.text()).body.innerHTML };
}

export function installComparison({
  mountRoot, getContext, getDocument,
  saveDocument, loadContent = readDeliveredContent,
}) {
  let surface;
  let generation = 0;
  let activeKey;
  let trigger;
  const inertStates = new Map();

  const close = () => {
    generation += 1;
    const restoreFocus = document.activeElement === surface;
    surface?.remove();
    surface = undefined;
    activeKey = undefined;
    inertStates.forEach((inert, el) => { el.inert = inert; });
    inertStates.clear();
    mountRoot.classList.remove('ew-comparison-host');
    if (restoreFocus && trigger?.isConnected) trigger.focus();
    return { ok: true };
  };

  const open = async (options) => {
    if (!['document', 'preview'].includes(options?.candidate) || options?.baseline !== 'live') {
      return { ok: false, error: 'invalid-comparison' };
    }
    const context = getContext();
    const key = comparisonContextKey(context);
    if (!key) return { ok: false, error: 'no-document' };
    close();
    const run = generation;
    activeKey = key;
    trigger = document.activeElement;
    const current = () => run === generation && comparisonContextKey(getContext()) === key;
    try {
      await import('./ew-comparison.js');
      if (!current()) return { ok: false, error: 'stale-context' };
      surface = document.createElement('ew-comparison');
      surface.candidate = options.candidate;
      surface.path = `/${context.path.replace(/^\//, '')}`;
      surface.onClose = close;
      surface.onRefresh = () => open(options);
      mountRoot.classList.add('ew-comparison-host');
      [...mountRoot.children].forEach((el) => {
        inertStates.set(el, el.inert);
        el.inert = true;
      });
      mountRoot.append(surface);
      await surface.updateComplete;
      surface.focusHeading();
      const documentHtml = options.candidate === 'document' ? getDocument?.() : null;
      if (options.candidate === 'document' && typeof documentHtml !== 'string') {
        throw new Error('The current document is not ready. Try again once it has loaded.');
      }
      const [live, candidate] = await Promise.all([
        loadContent('live', context),
        options.candidate === 'document' ? { html: documentHtml } : loadContent('preview', context),
      ]);
      if (!current()) return { ok: false, error: 'stale-context' };
      const htmlA = normalizeComparisonHtml(live.html, context);
      const htmlB = normalizeComparisonHtml(candidate.html, context);
      const { dom } = await buildCompareDom({ htmlA, htmlB, closeOnOutsideClick: false });
      if (!current()) return { ok: false, error: 'stale-context' };
      surface.diffDom = dom;
      surface.missingLive = live.missing;
      surface.identical = !dom.querySelector('ins, del');
      surface.loadedAt = new Date().toLocaleTimeString();
      surface.loading = false;
      return { ok: true };
    } catch (error) {
      if (!current()) return { ok: false, error: 'stale-context' };
      if (surface) {
        surface.error = error.message;
        surface.loading = false;
      }
      return { ok: false, error: error.message };
    }
  };

  const contextChanged = () => {
    if (activeKey && activeKey !== comparisonContextKey(getContext())) close();
  };
  const unsubscribe = canvasBus.comparisonRequest.subscribe(async (request) => {
    const { action, details, context, resolve } = request;
    if (!comparisonContextKey(context)
      || comparisonContextKey(context) !== comparisonContextKey(getContext())) {
      resolve({ ok: false, error: 'stale-context' });
      return;
    }
    try {
      if (action === 'openComparison') resolve(await open(details));
      else if (action === 'closeComparison') resolve(close());
      else if (action === 'saveDocument') {
        const result = await saveDocument?.();
        resolve(comparisonContextKey(context) === comparisonContextKey(getContext())
          ? result || { ok: false, error: 'no-document' } : { ok: false, error: 'stale-context' });
      }
    } catch (error) { resolve({ ok: false, error: error.message }); }
  });
  const unsubscribeChanges = canvasBus.editorHtmlState.subscribe(() => {
    if (surface?.candidate === 'document') surface.stale = true;
  });
  return {
    open,
    close,
    contextChanged,
    destroy: () => {
      close();
      unsubscribe();
      unsubscribeChanges();
    },
  };
}
