/* eslint-disable import/no-unresolved -- importmap */
import { DOMParser as PMDOMParser, DOMSerializer, NodeSelection, Slice, TextSelection } from 'da-y-wrapper';
import { slug } from '../../../deps/github-slugger/dist/index.js';
import { getNx, getNx2Api, sanitizeName } from '../../../scripts/utils.js';
import { daFetch, getAuthToken } from '../../shared/utils.js';
import { CON_ORIGIN } from '../../shared/constants.js';
import { getPreviewProxyDetails, ensurePreviewProxySession, toPreviewProxyUrl } from '../../shared/preview-proxy.js';
import { getPreviewOrigin } from '../editor-utils/editor-utils.js';
import { getCanvasBranch } from '../utils/branch.js';
import { htmlToProse } from '../../edit/utils/helpers.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';
import { getBlockPositions } from '../editor-utils/blocks.js';
import { getCommentsBridge, formatCommentsViewLabel } from '../editor-utils/comments-bridge.js';

const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const { fetchDaConfigs, getFirstSheet } = await import(`${getNx()}/utils/daConfig.js`);

const ref = new URLSearchParams(window.location.search).get('ref') || 'main';
const branch = sanitizeName(ref, false, false) || 'main';

const AEM_ORIGINS = ['hlx.page', 'hlx.live', 'aem.page', 'aem.live'];
const REPLACE_CONTENT = '<content>';
const blockLibraryCache = new Map();
const librarySessions = new Map();
const CONTENT_HOSTS = new Set(['content.da.live', 'stage-content.da.live']);

export const LIBRARY_AUTH_MESSAGE = 'Library access was denied. Check that you are signed in '
  + 'to DA and have access to this site. For a library hosted by another organization, open '
  + 'its preview and sign in with AEM Sidekick, then reopen the library.';

// ---------------------------------------------------------------------------
// Block HTML parsing — ported from da-live helpers/index.js
// ---------------------------------------------------------------------------

function isHeading(el) {
  return ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(el?.nodeName);
}

function addHeadingIds(doc) {
  // Match helix-html-pipeline's add-heading-ids and IDSlugger. Every missing
  // heading ID participates, even when the heading does not label a variant.
  // https://github.com/adobe/helix-html-pipeline/blob/main/src/utils/id-slugger.js
  const occurrences = new Map();
  doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    if (heading.id) return;
    const text = heading.textContent.trim();
    if (!text) return;

    const original = slug(text).replace(/^\d+-+/, '');
    let id = original;
    while (occurrences.has(id)) {
      const count = occurrences.get(original) + 1;
      occurrences.set(original, count);
      id = `${original}-${count}`;
    }
    occurrences.set(id, 0);
    heading.id = id;
  });
}

function getHeadingAnchor(heading) {
  return isHeading(heading) ? heading.id : undefined;
}

function getBlockName(className) {
  const [name, ...rest] = (className || '').split(' ');
  return { name, variants: rest.length ? rest.join(', ') : undefined };
}

function getBlockTableHtml(block) {
  const { name, variants } = getBlockName(block.className);
  const rows = [...block.children];
  const maxCols = rows.reduce((n, row) => Math.max(n, row.children.length), 0) || 1;

  const table = document.createElement('table');
  table.setAttribute('border', '1');

  const headerRow = document.createElement('tr');
  const th = document.createElement('td');
  th.setAttribute('colspan', String(maxCols));
  th.textContent = variants ? `${name} (${variants})` : name;
  headerRow.append(th);
  table.append(headerRow);

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const cells = [...row.children];
    cells.forEach((col, i) => {
      const td = document.createElement('td');
      // Pad only the last cell so the row's total width equals maxCols.
      // Spanning every cell (the old behavior) made short multi-cell rows
      // wider than maxCols, forcing ProseMirror to insert empty cells into
      // every other row to keep the table rectangular.
      if (cells.length < maxCols && i === cells.length - 1) {
        td.setAttribute('colspan', String(maxCols - i));
      }
      td.innerHTML = col.innerHTML;
      tr.append(td);
    });
    table.append(tr);
  });

  return table;
}

function decorateImages(element) {
  element.querySelectorAll('img').forEach((img) => {
    const ratio = img.width > 200 ? 200 / img.width : 1;
    img.width = Math.round(img.width * ratio);
    img.height = Math.round(img.height * ratio);
  });
}

// ---------------------------------------------------------------------------
// DA Preview Proxy — library content on protected sites
// ---------------------------------------------------------------------------

function libraryProxyOptions({ org, site, branch: sourceBranch = branch } = {}) {
  return { org, site, currentOrg: org, branch: sourceBranch, getUrl: getPreviewOrigin };
}

function libraryContentUrl(path, { org, site, branch: sourceBranch = branch } = {}) {
  if (!path.startsWith('/') || !org || !site) return path;
  const origin = ref === 'local' ? 'http://localhost:3000' : `https://${sourceBranch}--${site}--${org}.aem.live`;
  return new URL(path, origin).href;
}

function resolveLibraryImages(element, path, context, { variant = false } = {}) {
  const source = new URL(libraryContentUrl(path, context), window.location.href);
  const isAemSource = AEM_ORIGINS.some((domain) => source.hostname.endsWith(`.${domain}`));
  const isProxySource = /\.(?:stage-)?preview\.da\.live$/.test(source.hostname);
  const isContentSource = CONTENT_HOSTS.has(source.hostname);
  const proxyOpts = libraryProxyOptions(context);
  const details = getPreviewProxyDetails(source.href, { ...proxyOpts, currentOrg: undefined });
  const proxied = isProxySource || (proxyOpts.currentOrg
    && Boolean(getPreviewProxyDetails(source.href, proxyOpts).org));
  // Extensionless proxy pages are composed from DA source; .html/.plain.html use AEM.
  const aemHtml = proxied && /\.html$/i.test(source.pathname);
  const isDaSource = (isContentSource || proxied) && !aemHtml;
  let contentRoot;
  if (isDaSource && details.org) {
    const origin = isContentSource ? source.origin : CON_ORIGIN;
    contentRoot = `${origin}/${details.org}/${details.site}`;
    source.href = `${contentRoot}${details.pathname}${source.search}${source.hash}`;
  } else if (!isAemSource && proxied && details.org) {
    source.href = `https://${details.branch}--${details.site}--${details.org}.aem.page${details.pathname}${source.search}${source.hash}`;
  }
  element.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src');
    if (!src) return;
    try {
      const base = new URL(source.href);
      const { daImgHost: storedHost } = img.dataset;
      if (contentRoot && CONTENT_HOSTS.has(storedHost)) {
        base.protocol = 'https:';
        base.hostname = storedHost;
        base.port = '';
      }
      if (contentRoot && src.startsWith('/') && !src.startsWith('//')) {
        // DA composition strips the org/site prefix from stored content image URLs.
        const prefix = `/${details.org}/${details.site}`;
        const imagePath = src.startsWith(`${prefix}/`) ? src : `${prefix}${src}`;
        img.setAttribute('src', new URL(imagePath, base.origin).href);
      } else {
        const rootMedia = !isDaSource && (isAemSource || proxied)
          && (variant ? src.startsWith('./') : /^\.\/media_[^/?#]+(?:[?#].*)?$/.test(src));
        img.setAttribute('src', new URL(src, rootMedia ? `${base.origin}/` : base.href).href);
      }
      img.removeAttribute('data-da-img-host');
    } catch { /* a malformed image URL must not discard the entire block/template */ }
  });
}

async function ensureLibraryPreviewSession(url, context) {
  const proxyOpts = libraryProxyOptions(context);
  const details = getPreviewProxyDetails(url, proxyOpts);
  if (!proxyOpts.currentOrg || !details.org) return undefined;
  // The origin includes org/site/branch and the stage/production environment.
  const { origin } = new URL(details.url);
  const token = await getAuthToken();
  if (!token) {
    librarySessions.delete(origin);
    return undefined;
  }
  let session = librarySessions.get(origin);
  if (!session || session.token !== token) {
    session = { origin, token };
    session.pending = ensurePreviewProxySession(url, proxyOpts).then((ok) => {
      if (!ok && librarySessions.get(origin) === session) librarySessions.delete(origin);
      return ok;
    });
    librarySessions.set(origin, session);
  }
  return await session.pending ? session : undefined;
}

function invalidateLibrarySession(session) {
  if (session && librarySessions.get(session.origin) === session) {
    librarySessions.delete(session.origin);
  }
}

const isAuthFailure = (resp) => resp.status === 401 || resp.status === 403;

/**
 * Fetch library content, routing AEM-hosted URLs through the DA Preview Proxy.
 * Only proxy requests carry credentials: aem.page/aem.live answer with
 * `Access-Control-Allow-Origin: *`, which a credentialed request would fail.
 */
async function libraryFetch(href, context, opts = {}) {
  const proxyOpts = libraryProxyOptions(context);
  const source = libraryContentUrl(href, context);
  if (!proxyOpts.currentOrg) return daFetch(source, opts);
  const details = getPreviewProxyDetails(source, proxyOpts);
  if (!details.org) return daFetch(source, opts);
  let session = await ensureLibraryPreviewSession(source, context);
  let resp = await daFetch(details.url, { ...opts, credentials: 'include' });
  if (isAuthFailure(resp) && session) {
    invalidateLibrarySession(session);
    session = await ensureLibraryPreviewSession(source, context);
    if (session) {
      resp = await daFetch(details.url, { ...opts, credentials: 'include' });
      if (isAuthFailure(resp)) invalidateLibrarySession(session);
    }
  }
  return resp;
}

function plainHtmlUrl(path) {
  const url = new URL(path);
  url.pathname = `${url.pathname}.plain.html`;
  return url.href;
}

async function fetchAndParseHtml(path, isAemHosted, context) {
  try {
    const source = isAemHosted ? plainHtmlUrl(path) : path;
    const resp = await libraryFetch(source, context, { noRedirect: true });
    if (!resp.ok) return { authError: isAuthFailure(resp) };
    return { doc: new window.DOMParser().parseFromString(await resp.text(), 'text/html') };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[ew-library] Unable to load variant HTML', error);
    return {};
  }
}

function getSectionsAndBlocks(doc) {
  return [...doc.querySelectorAll('body > div, main > div')].reduce((acc, section) => {
    const hr = document.createElement('hr');
    hr.dataset.issection = 'true';
    acc.push(hr, ...section.querySelectorAll(':scope > *'));
    return acc;
  }, []);
}

function processGroupBlock(block) {
  const container = document.createElement('div');
  [...block.children].forEach((child) => {
    container.append(child.tagName === 'DIV' ? getBlockTableHtml(child) : child.cloneNode(true));
  });
  return container;
}

function groupBlocks(elements) {
  return elements.reduce((state, el) => {
    if (el.classList?.contains('library-container-start')) {
      const blockGroup = document.createElement('div');
      blockGroup.dataset.isgroup = 'true';
      if (isHeading(el.previousElementSibling)) {
        blockGroup.dataset.groupheading = el.previousElementSibling.textContent;
        blockGroup.dataset.groupanchor = getHeadingAnchor(el.previousElementSibling);
      }
      state.currentGroup = { blockGroup };
    } else if (el.classList?.contains('library-container-end') && state.currentGroup) {
      const { blockGroup } = state.currentGroup;
      if (el.nextElementSibling?.classList.contains('library-metadata')) {
        blockGroup.append(el.nextElementSibling.cloneNode(true));
      }
      state.blocks.push(blockGroup);
      state.currentGroup = null;
    } else if (state.currentGroup) {
      state.currentGroup.blockGroup.append(el.cloneNode(true));
    } else if (
      el.nodeName === 'DIV'
      && !el.dataset?.issection
      && !el.classList?.contains('library-metadata')
    ) {
      state.blocks.push(el);
    }
    return state;
  }, { blocks: [], currentGroup: null }).blocks;
}

function getLibraryMetadata(el) {
  return [...el.childNodes].reduce((acc, row) => {
    if (row.children) {
      const key = row.children[0]?.textContent.trim().toLowerCase();
      const val = row.children[1]?.textContent.trim();
      if (key && val) acc[key] = val;
    }
    return acc;
  }, {});
}

// Metadata can sit immediately before or after the block it describes, or be
// nested inside it (nested case also covers any position within a
// library-container-start/end group, since group children are flattened into
// the group's own subtree during parsing).
function findMetaEl(block) {
  if (block.nextElementSibling?.classList.contains('library-metadata')) {
    return block.nextElementSibling;
  }
  if (block.previousElementSibling?.classList.contains('library-metadata')) {
    return block.previousElementSibling;
  }
  return block.querySelector('.library-metadata');
}

function transformBlock(block) {
  // Skip a preceding metadata sibling so a `heading, metadata, block` layout
  // still resolves the name from the heading.
  const headingSib = block.previousElementSibling?.classList.contains('library-metadata')
    ? block.previousElementSibling.previousElementSibling
    : block.previousElementSibling;
  let item;
  if (block.dataset.groupheading) {
    item = { name: block.dataset.groupheading };
  } else if (isHeading(headingSib) && headingSib.textContent) {
    item = { name: headingSib.textContent };
  } else {
    item = getBlockName(block.className || '');
  }
  const anchor = block.dataset.groupanchor || getHeadingAnchor(headingSib);
  if (anchor) item.anchor = anchor;

  // Extract and strip metadata before generating the block's dom, so it never
  // leaks into the content that gets copied/inserted or previewed.
  const metaEl = findMetaEl(block);
  if (metaEl) {
    const md = getLibraryMetadata(metaEl);
    if (md.name) item.name = md.name;
    if (md.searchtags) item.tags = md.searchtags;
    if (md.description) item.description = md.description;
    metaEl.remove();
  }

  item.dom = block.dataset?.isgroup ? processGroupBlock(block) : getBlockTableHtml(block);
  return item;
}

export async function getBlockVariants(path, context) {
  const source = libraryContentUrl(path, context);
  let isAemHosted = false;
  try {
    isAemHosted = AEM_ORIGINS.some((o) => new URL(source).hostname.endsWith(`.${o}`));
  } catch { /* relative path */ }

  const { doc, authError } = await fetchAndParseHtml(source, isAemHosted, context);
  if (!doc) {
    const variants = [];
    if (authError) {
      variants.authError = true;
      blockLibraryCache.delete(`${context?.org}/${context?.site}`);
    }
    return variants;
  }

  addHeadingIds(doc);
  // Resolve against the actual HTML source, never the authenticated proxy origin.
  const imageSource = isAemHosted ? plainHtmlUrl(source) : source;
  resolveLibraryImages(doc.body, imageSource, context, { variant: true });
  decorateImages(doc.body);
  return groupBlocks(getSectionsAndBlocks(doc)).map(transformBlock);
}

// ---------------------------------------------------------------------------
// Extension config
// ---------------------------------------------------------------------------

const OOTB_PLUGINS = new Set(['blocks', 'templates', 'icons', 'placeholders']);

/** First-party library tools + AEM Assets (not flagged `ootb` in plugin metadata). */
const LIBRARY_PLUGIN_NAMES = new Set([...OOTB_PLUGINS, 'aem-assets']);

const LIBRARY_PANEL_ORDER = ['blocks', 'icons', 'templates', 'placeholders', 'aem-assets'];

function isLibraryExtension(ext) {
  return LIBRARY_PLUGIN_NAMES.has(ext.name);
}

function sortLibraryExtensions(list) {
  const orderOf = (name) => {
    const i = LIBRARY_PANEL_ORDER.indexOf(name);
    return i === -1 ? LIBRARY_PANEL_ORDER.length + 1 : i;
  };
  return [...list].sort((a, b) => orderOf(a.name) - orderOf(b.name));
}

function getIsPluginAllowed(plugRef) {
  const pluginRef = plugRef || 'main';
  if (pluginRef === 'main') return true;
  if (ref === 'local') return true;
  return pluginRef === ref;
}

function calculateSources(org, site, sheetPath) {
  return sheetPath.split(',').map((p) => {
    const trimmed = p.trim();
    if (!trimmed.startsWith('/')) return trimmed;
    if (ref === 'local') return `http://localhost:3000${trimmed}`;
    return `https://${branch}--${site}--${org}.aem.live${trimmed}`;
  });
}

function mergePlugin(list, plugin) {
  let idx = list.findIndex((p) => p.name === 'templates');
  if (idx === -1) idx = list.findIndex((p) => p.name === 'blocks');
  if (idx !== -1) {
    list.splice(idx + 1, 0, plugin);
  } else {
    list.push(plugin);
  }
}

export async function fetchExtensions(org, site) {
  const configs = await Promise.all(fetchDaConfigs({ org, site }));
  const validConfigs = configs.filter((conf) => !conf?.error).reverse();
  if (!validConfigs.length) return [];

  const rows = validConfigs.flatMap((conf) => conf?.library?.data || []);

  const seen = new Set();
  const extensions = rows.reduce((acc, row) => {
    if (!row.title || !getIsPluginAllowed(row.ref)) return acc;
    const name = row.title.trim().toLowerCase().replaceAll(' ', '-');
    if (seen.has(name)) return acc;
    seen.add(name);
    acc.push({
      name,
      title: row.title.trim(),
      sources: calculateSources(org, site, row.path),
      experience: row.experience || 'inline',
      format: row.format || '',
      icon: row.icon || '',
      ootb: OOTB_PLUGINS.has(name),
      org,
    });
    return acc;
  }, []);

  try {
    const entries = validConfigs.flatMap((conf) => getFirstSheet(conf) || []);
    const hasRepo = entries.find((entry) => entry.key === 'aem.repositoryId')?.value;
    if (hasRepo) {
      const { getAssetsPlugin } = await import('./aem-assets.js');
      const plugin = getAssetsPlugin({ org, site });
      if (plugin) mergePlugin(extensions, plugin);
    }
  } catch { /* proceed without assets */ }

  return extensions;
}

/** Resolve the configured "blocks" library extension for an org/site, or null. */
export async function getBlocksExtension(org, site) {
  if (!org || !site) return null;
  const extensions = await fetchExtensions(org, site);
  return extensions?.find((ext) => ext.name === 'blocks') || null;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Fetch the blocks listed by the library sources. Access failures (401/403) set
 * `authError: true` so callers can retry and explain an empty library.
 */
export async function fetchBlocks(sources, context) {
  const blocks = [];
  let authError = false;
  for (const url of sources) {
    try {
      const resp = await libraryFetch(url, context, { noRedirect: true });
      if (!resp.ok && isAuthFailure(resp)) authError = true;
      if (resp.ok) {
        const json = await resp.json();
        const data = getFirstSheet(json) ?? (Array.isArray(json) ? json : []);
        data.forEach((row) => {
          if (row.name && row.path) {
            blocks.push({ ...row, loadVariants: getBlockVariants(row.path, context) });
          }
        });
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[ew-library] Unable to load block source', url, error);
    }
  }
  if (authError) blocks.authError = true;
  return blocks;
}

/**
 * Load — and memoize per org/site — the configured blocks library: the resolved
 * "blocks" extension plus its fetched blocks (each carrying a lazy `loadVariants`
 * promise). Shared by the slash-menu prefetch and the block-library modal so the
 * library (and every variant's HTML) is fetched and parsed at most once.
 * Resolves to `{ ext: null, blocks: [] }` when no library is configured.
 */
export function loadBlockLibrary(org, site) {
  if (!org || !site) return Promise.resolve({ ext: null, blocks: [] });
  const key = `${org}/${site}`;
  if (!blockLibraryCache.has(key)) {
    const pending = (async () => {
      const ext = await getBlocksExtension(org, site);
      if (!ext) return { ext: null, blocks: [] };
      const blocks = await fetchBlocks(ext.sources, { org, site });
      // Don't memoize an access failure: signing in should fix it without a reload.
      if (blocks.authError) blockLibraryCache.delete(key);
      return { ext, blocks };
    })().catch((err) => {
      // Don't cache transient failures — allow a later retry.
      blockLibraryCache.delete(key);
      throw err;
    });
    blockLibraryCache.set(key, pending);
  }
  return blockLibraryCache.get(key);
}

export function resetBlockLibraryCache() {
  blockLibraryCache.clear();
  librarySessions.clear();
}

const librarySheetCache = new Map();

/**
 * Fetch and memoize a named sheet's rows from the block library sources — e.g.
 * "options" (per-block key/value autocomplete) or "editor" (multi-block config).
 * Resolves to [] when no library / sheet is configured.
 */
function loadLibrarySheet(org, site, sheet) {
  if (!org || !site) return Promise.resolve([]);
  const key = `${sheet}:${org}/${site}`;
  if (!librarySheetCache.has(key)) {
    const pending = (async () => {
      const ext = await getBlocksExtension(org, site);
      if (!ext) return [];
      const rows = [];
      let authError = false;
      for (const url of ext.sources || []) {
        try {
          const resp = await libraryFetch(url, { org, site }, { noRedirect: true });
          if (!resp.ok && isAuthFailure(resp)) authError = true;
          if (resp.ok) {
            const json = await resp.json();
            if (Array.isArray(json?.[sheet]?.data)) rows.push(...json[sheet].data);
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn('[ew-library] Unable to load library sheet', url, error);
        }
      }
      if (authError) librarySheetCache.delete(key);
      return rows;
    })().catch((err) => {
      librarySheetCache.delete(key);
      throw err;
    });
    librarySheetCache.set(key, pending);
  }
  return librarySheetCache.get(key);
}

export const loadBlockOptions = (org, site) => loadLibrarySheet(org, site, 'options');
export const loadBlockEditor = (org, site) => loadLibrarySheet(org, site, 'editor');

export function resetBlockOptionsCache() {
  librarySheetCache.clear();
}

/** Like fetchBlocks, including the `authError` flag, for OOTB item sheets. */
export async function fetchItems(sources, format, context) {
  const items = [];
  let authError = false;
  for (const source of sources) {
    try {
      const resp = await libraryFetch(source, context, { noRedirect: true });
      if (!resp.ok && isAuthFailure(resp)) authError = true;
      if (resp.ok) {
        const json = await resp.json();
        const data = getFirstSheet(json) ?? (Array.isArray(json) ? json : []);
        data.forEach((row) => {
          const key = row.key ?? row.name;
          if (!key && !row.value) return;
          const text = format ? format.replace(REPLACE_CONTENT, key ?? '') : (key ?? '');
          items.push({ ...row, key: key ?? '', text });
        });
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[ew-library] Unable to load item source', source, error);
    }
  }
  if (authError) items.authError = true;
  return items;
}

// ---------------------------------------------------------------------------
// Content insertion
// ---------------------------------------------------------------------------

export function insertBlock(view, dom) {
  const parsed = PMDOMParser.fromSchema(view.state.schema).parse(dom);
  const { tr, schema } = view.state;
  const insertPos = tr.selection.from;
  let newTr = tr.insert(insertPos, schema.nodes.paragraph.create());
  newTr = newTr.replaceSelectionWith(parsed);
  const finalPos = Math.min(insertPos + parsed.nodeSize, newTr.doc.content.size);
  view.dispatch(newTr.setSelection(TextSelection.create(newTr.doc, finalPos)).scrollIntoView());
}

export function insertText(view, text) {
  const node = view.state.schema.text(text);
  view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
}

export function insertHTML(view, htmlStr) {
  const doc = new window.DOMParser().parseFromString(htmlStr, 'text/html');
  const parsed = PMDOMParser.fromSchema(view.state.schema).parse(doc.body);
  const slice = new Slice(parsed.content, 0, 0);
  const { from, to } = view.state.selection;
  view.dispatch(view.state.tr.replaceRange(from, to, slice).scrollIntoView());
}

export function replaceHTMLAtCursor(view, html) {
  const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
  if (!view.editable) fail('READ_ONLY', 'The editor is read-only.');
  if (typeof html !== 'string' || !html.trim()) fail('INVALID_HTML', 'Replacement HTML is required.');
  const { state } = view;
  const { selection } = state;
  const { from, to, $from } = selection;
  const blockPos = getBlockPositions(view).find((pos) => {
    const end = pos + state.doc.nodeAt(pos).nodeSize;
    return from >= pos && from < end;
  });
  let start = blockPos;
  if (start === undefined) {
    if (selection instanceof NodeSelection && selection.node.isInline) start = from;
    else if ($from.depth) start = $from.before(1);
    else if (selection instanceof NodeSelection) start = from;
  }
  if (start === undefined) fail('NO_TARGET', 'Place the cursor inside content to replace.');
  const original = state.doc.nodeAt(start);
  const end = start + original.nodeSize;
  if (to > end) fail('CROSS_TARGET', 'The selection spans multiple replacement targets.');
  const input = new window.DOMParser().parseFromString(html, 'text/html');
  const hasEdsBlock = input.body.querySelector('main, div[class]');
  const main = input.querySelector('main');
  const inputs = main ? [...main.children].flatMap((section) => [...section.children])
    : [...input.body.children];
  if (inputs.length !== 1) fail('INVALID_HTML', 'Replacement must contain exactly one content node.');
  let dom = input.body;
  if (hasEdsBlock) {
    const converted = htmlToProse(main?.outerHTML || `<main><div>${input.body.innerHTML}</div></main>`);
    dom = converted.dom;
    converted.ydoc.destroy();
  }
  // aem2doc adds empty paragraphs around block tables for caret insertion.
  if (hasEdsBlock && inputs[0].matches('div[class]')) {
    dom.querySelectorAll(':scope > p:empty').forEach((node) => node.remove());
  }
  const parsed = PMDOMParser.fromSchema(state.schema).parse(dom);
  let { content } = parsed;
  if (original.isInline && parsed.childCount === 1 && parsed.firstChild.isTextblock) {
    content = parsed.firstChild.content;
  }
  if (content.childCount !== 1) fail('INVALID_HTML', 'Replacement must contain exactly one content node.');
  const replacement = content.firstChild;
  const $start = state.doc.resolve(start);
  if (!$start.parent.canReplace($start.index(), $start.index() + 1, content)) {
    fail('INVALID_HTML', 'Replacement is not valid at this position.');
  }
  if (original.eq(replacement)) return;
  const tr = state.tr.replaceWith(start, end, content);
  const mapPosition = (pos) => {
    let offset = pos - start;
    const diffStart = original.content.findDiffStart(replacement.content);
    const diffEnd = original.content.findDiffEnd(replacement.content);
    if (diffStart !== null && diffEnd) {
      const changeStart = diffStart + 1;
      const overlap = Math.max(0, diffStart - diffEnd.a);
      const oldEnd = diffEnd.a + 1 + overlap;
      const newEnd = diffEnd.b + 1 + overlap;
      if (offset >= oldEnd) offset += newEnd - oldEnd;
      else if (offset > changeStart) offset = Math.min(offset, newEnd);
    }
    return Math.max(start, Math.min(start + offset, start + replacement.nodeSize - 1));
  };
  const anchor = mapPosition(selection.anchor);
  const head = mapPosition(selection.head);
  if (selection instanceof NodeSelection && tr.doc.nodeAt(anchor)
    && NodeSelection.isSelectable(tr.doc.nodeAt(anchor))) {
    tr.setSelection(NodeSelection.create(tr.doc, anchor));
  } else {
    tr.setSelection(TextSelection.between(tr.doc.resolve(anchor), tr.doc.resolve(head)));
  }
  view.dispatch(tr);
}

export function insertLibraryBlock(view, dom) {
  const { from, to } = view.state.selection;
  const inBlock = getBlockPositions(view).some((pos) => {
    const end = pos + view.state.doc.nodeAt(pos).nodeSize;
    return from >= pos && from < end && to <= end;
  });
  if (inBlock && dom.tagName === 'TABLE') {
    replaceHTMLAtCursor(view, dom.outerHTML);
    return;
  }
  insertBlock(view, dom);
}

export function getEditorSelection(view) {
  const { selection } = view.state;
  if (selection.empty) return null;
  const slice = selection.content();
  const serializer = DOMSerializer.fromSchema(view.state.schema);
  const fragment = serializer.serializeFragment(slice.content);
  const div = document.createElement('div');
  div.appendChild(fragment);
  return div.innerHTML;
}

export async function insertTemplate(view, url, context) {
  const resp = await libraryFetch(url, context, { noRedirect: true });
  if (!resp.ok) {
    throw new Error(isAuthFailure(resp) ? LIBRARY_AUTH_MESSAGE : `Unable to load template (${resp.status}).`);
  }
  const html = (await resp.text()).replace('class="template-metadata"', 'class="metadata"');
  const doc = new window.DOMParser().parseFromString(html, 'text/html');
  resolveLibraryImages(doc.body, url, context);
  const { dom } = htmlToProse(doc.body.innerHTML);
  const parsed = PMDOMParser.fromSchema(view.state.schema).parse(dom);
  view.dispatch(view.state.tr.replaceSelectionWith(parsed).scrollIntoView());
}

// ---------------------------------------------------------------------------
// Preview status
// ---------------------------------------------------------------------------

export async function getPreviewStatus({ org, site, pathname }) {
  const path = `/${org}/${site}${pathname}`;
  try {
    const { status } = await getNx2Api();
    const resp = await status.get(path);
    if (!resp.ok) return null;
    const json = await resp.json();
    return json.preview?.status === 200;
  } catch {
    return null;
  }
}

export function getItemPreviewUrl(item, { org, site }) {
  const previewBranch = getCanvasBranch({ org, site });
  if (!previewBranch) return null;
  const context = { org, site, branch: previewBranch };
  const input = libraryContentUrl(item.path || item.value, context);
  const proxyOpts = libraryProxyOptions(context);
  const target = getPreviewProxyDetails(input, proxyOpts);
  const metadata = getPreviewProxyDetails(input, { ...proxyOpts, currentOrg: undefined });
  if (target.org) {
    // Item previews render with the canvas branch, not the library source's branch.
    const { pathname, search, hash } = new URL(target.url);
    target.url = `${getPreviewOrigin(target.org, target.site, previewBranch)}${pathname}${search}${hash}`;
  } else if (metadata.org) {
    // Cross-org item previews still need rendered HTML, not a raw DA source endpoint.
    const { search, hash } = new URL(input);
    target.url = `https://${previewBranch}--${metadata.site}--${metadata.org}.aem.page${metadata.pathname}${search}${hash}`;
  }

  return {
    previewUrl: target.url,
    org: metadata.org,
    site: metadata.site,
    pathname: metadata.pathname,
  };
}

/**
 * Resolve an item's preview details and make sure the proxy session cookie for
 * that org/site/branch exists before the caller points an iframe at it.
 */
export async function ensureItemPreviewAccess(item, { org, site }) {
  const details = getItemPreviewUrl(item, { org, site });
  if (!details) return null;
  if (details.org?.toLowerCase() === org?.toLowerCase() && org) {
    let error;
    try {
      // Iframe HTTP failures are opaque to callers. Validate the browser cookie
      // on every navigation, while reusing successful cookie exchanges.
      const resp = await libraryFetch(details.previewUrl, { org, site }, {
        method: 'HEAD',
        cache: 'no-store',
        noRedirect: true,
      });
      if (!resp.ok && resp.status !== 404) {
        error = isAuthFailure(resp) ? LIBRARY_AUTH_MESSAGE : `Unable to load preview (${resp.status}).`;
      }
    } catch {
      error = 'Unable to check preview access. Please try again.';
    }
    if (error) return { ...details, previewUrl: undefined, error };
  }
  return details;
}

// ---------------------------------------------------------------------------
// View facade — canvas.js calls this, nothing else
// ---------------------------------------------------------------------------

function createOutlineView() {
  return {
    id: 'outline',
    label: 'Outline',
    section: 'Editor',
    firstParty: true,
    load: async () => {
      await import('../ew-page-outline/ew-page-outline.js');
      return document.createElement('ew-page-outline');
    },
  };
}

function createFileExplorerView() {
  return {
    id: 'files',
    label: 'Files',
    section: 'Editor',
    firstParty: true,
    load: async () => {
      await import('../ew-file-explorer/ew-file-explorer.js');
      return document.createElement('ew-file-explorer');
    },
  };
}

function createVersioningView() {
  return {
    id: 'versions',
    label: 'Versions',
    section: 'Editor',
    firstParty: true,
    load: async () => {
      await import('../ew-canvas-versions/ew-canvas-versions.js');
      return document.createElement('ew-canvas-versions');
    },
  };
}

export function createPreflightView() {
  return {
    id: 'preflight',
    label: 'Preflight',
    section: 'Editor',
    firstParty: true,
    load: async () => {
      await import('../ew-preflight/ew-preflight-host.js');
      return document.createElement('ew-preflight-host');
    },
  };
}

export function createCommentsView() {
  return {
    id: 'comments',
    label: 'Comments',
    section: 'Editor',
    firstParty: true,
    getLabel() {
      return formatCommentsViewLabel(getCommentsBridge().controller?.counts?.active);
    },
    load: async () => {
      await import('../comments/comments-panel.js');
      return document.createElement('ew-comments');
    },
  };
}

export function createMetadataView() {
  return {
    id: 'metadata',
    label: 'Page',
    section: 'Editor',
    firstParty: true,
    load: async () => {
      await import('../ew-page-metadata/ew-page-metadata.js');
      return document.createElement('ew-page-metadata');
    },
  };
}

export function extensionToPanelView(ext, section) {
  const proxyOpts = { getUrl: getPreviewOrigin, currentOrg: ext.org };
  // Block library opens its own dedicated modal (used by the slash menu and
  // outline "+" button) rather than the generic inline panel or iframe dialog.
  if (ext.name === 'blocks') {
    return {
      id: ext.name,
      label: ext.title,
      section,
      firstParty: ext.ootb,
      experience: 'modal',
      icon: ext.icon,
      openModal: async () => {
        const { openBlockLibraryModal } = await import('../ew-block-library-modal/ew-block-library-modal.js');
        openBlockLibraryModal({
          onInsert: (dom) => {
            const { view } = getExtensionsBridge();
            if (view) insertLibraryBlock(view, dom);
          },
        });
      },
    };
  }

  const view = {
    id: ext.name,
    label: ext.title,
    section,
    firstParty: ext.ootb,
    ...(!ext.ootb && { cacheKey: JSON.stringify(ext.sources || []) }),
    experience: ext.experience,
    // Window extensions open in a new tab where the user authenticates via sidekick.
    sources: ext.ootb || ext.experience === 'window'
      ? ext.sources
      : (ext.sources || []).map(
        (source) => toPreviewProxyUrl(source, proxyOpts),
      ),
    icon: ext.ootb ? ext.icon : toPreviewProxyUrl(ext.icon, proxyOpts),
    load: async () => {
      await import('./ew-panel-extensions.js');
      const el = document.createElement('ew-panel-extension');
      el.extension = ext;
      return el;
    },
  };

  if (ext.experience === 'fullsize-dialog') {
    view.loadModal = async (container, onClose) => {
      if (ext.name === 'aem-assets') {
        const { renderAssets } = await import('./aem-assets.js');
        await renderAssets({ container, org: ext.org, site: ext.site, onClose });
        return () => { };
      }

      const iframe = document.createElement('iframe');
      iframe.className = 'ext-iframe';
      const src = toPreviewProxyUrl(ext.sources?.[0] ?? '', proxyOpts);
      await ensurePreviewProxySession(src, proxyOpts);
      iframe.src = src;
      iframe.title = ext.title;
      iframe.allow = 'clipboard-write *';
      container.append(iframe);

      let destroyChannel = () => { };
      iframe.addEventListener('load', async () => {
        let hashState;
        const unsub = hashChange.subscribe((s) => { hashState = s; });
        unsub();
        const { setupIframeChannel } = await import('./iframe-protocol.js');
        const { destroy } = await setupIframeChannel({
          iframe,
          hashState: hashState ?? {},
          getView: () => getExtensionsBridge().view,
          onClose,
        });
        destroyChannel = destroy;
      }, { once: true });

      return () => destroyChannel();
    };
  }

  return view;
}

/**
 * Tool panel: Editor placeholder, Library (blocks / AEM Assets / icons / templates / placeholders),
 * Extensions (other plugins).
 */
export async function getCanvasToolPanelViews({ org, site }) {
  const extensions = await fetchExtensions(org, site);
  const library = sortLibraryExtensions(extensions.filter(isLibraryExtension));
  const thirdParty = extensions.filter((ext) => !isLibraryExtension(ext));

  return [
    createOutlineView(),
    createMetadataView(),
    createFileExplorerView(),
    createVersioningView(),
    createCommentsView(),
    createPreflightView(),
    ...library.map((ext) => extensionToPanelView(ext, 'Library')),
    ...thirdParty.map((ext) => extensionToPanelView(ext, 'Extensions')),
  ];
}
