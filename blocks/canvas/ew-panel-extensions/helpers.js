/* eslint-disable import/no-unresolved -- importmap */
import { DOMParser as PMDOMParser, DOMSerializer, Slice, TextSelection } from 'da-y-wrapper';
import { getNx, getNx2Api, sanitizeName } from '../../../scripts/utils.js';
import { daFetch } from '../../shared/utils.js';
import { getPreviewProxyDetails, ensurePreviewProxySession, toPreviewProxyUrl } from '../../shared/preview-proxy.js';
import { getPreviewOrigin } from '../editor-utils/editor-utils.js';
import { htmlToProse } from '../../edit/utils/helpers.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';
import { getCommentsBridge, formatCommentsViewLabel } from '../editor-utils/comments-bridge.js';

const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const { fetchDaConfigs, getFirstSheet } = await import(`${getNx()}/utils/daConfig.js`);

const ref = new URLSearchParams(window.location.search).get('ref') || 'main';
const branch = sanitizeName(ref, false, false) || 'main';

const AEM_ORIGINS = ['hlx.page', 'hlx.live', 'aem.page', 'aem.live'];
const REPLACE_CONTENT = '<content>';
const blockLibraryCache = new Map();

export const LIBRARY_AUTH_MESSAGE = 'Library access was denied. Check that you are signed in '
  + 'to DA and have access to this site. For a library hosted by another organization, open '
  + 'its preview and sign in with AEM Sidekick, then reopen the library.';

// ---------------------------------------------------------------------------
// Block HTML parsing — ported from da-live helpers/index.js
// ---------------------------------------------------------------------------

function isHeading(el) {
  return ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(el?.nodeName);
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

function decorateImages(element, path) {
  try {
    const { origin } = new URL(path);
    element.querySelectorAll('img').forEach((img) => {
      if (img.getAttribute('src')?.startsWith('./')) {
        img.src = `${origin}/${img.src.split('/').pop()}`;
      }
      const ratio = img.width > 200 ? 200 / img.width : 1;
      img.width = Math.round(img.width * ratio);
      img.height = Math.round(img.height * ratio);
    });
  } catch { /* leave images as-is */ }
}

// ---------------------------------------------------------------------------
// DA Preview Proxy — library content on protected sites
// ---------------------------------------------------------------------------

function libraryProxyOptions({ org, site } = {}) {
  return { org, site, currentOrg: org, branch, getUrl: getPreviewOrigin };
}

function libraryContentUrl(path, { org, site } = {}) {
  if (!path.startsWith('/') || !org || !site) return path;
  const origin = ref === 'local' ? 'http://localhost:3000' : `https://${branch}--${site}--${org}.aem.live`;
  return new URL(path, origin).href;
}

function resolveTemplateImages(element, path, context) {
  const source = new URL(libraryContentUrl(path, context), window.location.href);
  const isAemSource = AEM_ORIGINS.some((domain) => source.hostname.endsWith(`.${domain}`));
  const isProxySource = /\.(?:stage-)?preview\.da\.live$/.test(source.hostname);
  const proxyOpts = libraryProxyOptions(context);
  const imageOpts = { ...proxyOpts, currentOrg: isProxySource ? undefined : proxyOpts.currentOrg };
  const details = proxyOpts.currentOrg || isProxySource
    ? getPreviewProxyDetails(source.href, imageOpts) : {};
  if (!isAemSource && details.org) {
    // Proxy HTML is AEM-rendered; persist its public counterpart, not the proxy origin.
    const proxy = new URL(details.url);
    source.href = `https://${details.branch}--${details.site}--${details.org}.aem.page${proxy.pathname}${proxy.search}${proxy.hash}`;
  }
  element.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src');
    if (!src) return;
    // Only generated AEM media references use the site root rather than the document directory.
    const rootMedia = (isAemSource || details.org) && /^\.\/media_[^/?#]+(?:[?#].*)?$/.test(src);
    img.setAttribute('src', new URL(src, rootMedia ? `${source.origin}/` : source.href).href);
  });
}

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
  await ensurePreviewProxySession(source, proxyOpts);
  return daFetch(details.url, { ...opts, credentials: 'include' });
}

const isAuthFailure = (resp) => resp.status === 401 || resp.status === 403;

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

  // Resolve images against the public (AEM) origin, not the proxy: this DOM is
  // inserted into — and saved with — the document.
  decorateImages(doc.body, source);
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
  resolveTemplateImages(doc.body, url, context);
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
  const input = libraryContentUrl(item.path || item.value, { org, site });
  const proxyOpts = libraryProxyOptions({ org, site });
  const target = getPreviewProxyDetails(input, proxyOpts);
  // Retain status metadata for a direct cross-org URL without proxying or authenticating it.
  const metadata = getPreviewProxyDetails(input, { ...proxyOpts, currentOrg: undefined });

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
  if (org) await ensurePreviewProxySession(details.previewUrl, libraryProxyOptions({ org, site }));
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
            if (view) insertBlock(view, dom);
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
    ...library.map((ext) => extensionToPanelView(ext, 'Library')),
    ...thirdParty.map((ext) => extensionToPanelView(ext, 'Extensions')),
  ];
}
