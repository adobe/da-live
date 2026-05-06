/* eslint-disable import/no-unresolved -- importmap */
import { DOMParser as PMDOMParser, DOMSerializer, Slice, TextSelection } from 'da-y-wrapper';
import { HLX_ADMIN, hashChange } from '../../shared/nxutils.js';
import { daFetch } from '../../shared/utils.js';
import { fetchDaConfigs, getFirstSheet } from '../../shared/nxutils.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';

const ref = new URLSearchParams(window.location.search).get('ref') || 'main';

const AEM_ORIGINS = ['hlx.page', 'hlx.live', 'aem.page', 'aem.live'];
const REPLACE_CONTENT = '<content>';

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
    [...row.children].forEach((col) => {
      const td = document.createElement('td');
      if (row.children.length < maxCols) td.setAttribute('colspan', String(maxCols));
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

async function fetchAndParseHtml(path, isAemHosted) {
  try {
    const resp = await daFetch(`${path}${isAemHosted ? '.plain.html' : ''}`);
    if (!resp.ok) return null;
    return new window.DOMParser().parseFromString(await resp.text(), 'text/html');
  } catch { return null; }
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

function transformBlock(block) {
  const prevSib = block.previousElementSibling;
  const item = isHeading(prevSib) && prevSib.textContent
    ? { name: prevSib.textContent }
    : getBlockName(block.className || '');
  item.dom = block.dataset?.isgroup ? processGroupBlock(block) : getBlockTableHtml(block);

  const metaEl = block.nextElementSibling?.classList.contains('library-metadata')
    ? block.nextElementSibling
    : block.querySelector('.library-metadata');
  if (metaEl) {
    const md = getLibraryMetadata(metaEl);
    if (md.searchtags) item.tags = md.searchtags;
    if (md.description) item.description = md.description;
  }
  return item;
}

export async function getBlockVariants(path) {
  let isAemHosted = false;
  try {
    isAemHosted = AEM_ORIGINS.some((o) => new URL(path).origin.endsWith(o));
  } catch { /* relative path */ }

  const doc = await fetchAndParseHtml(path, isAemHosted);
  if (!doc) return [];

  decorateImages(doc.body, path);
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
    return `https://${ref}--${site}--${org}.aem.live${trimmed}`;
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
  const configs = fetchDaConfigs({ org, site });
  const siteConfig = await configs[configs.length - 1];
  if (siteConfig?.error) return [];

  const rows = siteConfig?.library?.data;
  if (!Array.isArray(rows)) return [];

  const extensions = rows.reduce((acc, row) => {
    if (!getIsPluginAllowed(row.ref)) return acc;
    const name = row.title.trim().toLowerCase().replaceAll(' ', '-');
    acc.push({
      name,
      title: row.title.trim(),
      sources: calculateSources(org, site, row.path),
      experience: row.experience || 'inline',
      format: row.format || '',
      ootb: OOTB_PLUGINS.has(name),
    });
    return acc;
  }, []);

  try {
    const siteEntries = getFirstSheet(siteConfig) || [];
    const hasRepo = siteEntries.find((e) => e.key === 'aem.repositoryId')?.value;
    if (hasRepo) {
      const { getAssetsPlugin } = await import('./aem-assets.js');
      const plugin = getAssetsPlugin({ org, site });
      if (plugin) mergePlugin(extensions, plugin);
    }
  } catch { /* proceed without assets */ }

  return extensions;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

export async function fetchBlocks(sources) {
  const blocks = [];
  for (const url of sources) {
    try {
      const resp = await daFetch(url);
      if (resp.ok) {
        const json = await resp.json();
        const data = getFirstSheet(json) ?? (Array.isArray(json) ? json : []);
        data.forEach((row) => {
          if (row.name && row.path) {
            blocks.push({ ...row, loadVariants: getBlockVariants(row.path) });
          }
        });
      }
    } catch { /* skip failed source */ }
  }
  return blocks;
}

export async function fetchItems(sources, format) {
  const items = [];
  for (const source of sources) {
    try {
      const resp = await daFetch(source);
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
    } catch { /* skip failed source */ }
  }
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

export async function insertTemplate(view, url) {
  const resp = await daFetch(url);
  if (!resp.ok) return;
  const html = (await resp.text()).replace('class="template-metadata"', 'class="metadata"');
  const doc = new window.DOMParser().parseFromString(html, 'text/html');
  const parsed = PMDOMParser.fromSchema(view.state.schema).parse(doc.body);
  view.dispatch(view.state.tr.replaceSelectionWith(parsed).scrollIntoView());
}

// ---------------------------------------------------------------------------
// Preview status
// ---------------------------------------------------------------------------

export async function getPreviewStatus({ org, site, pathname }) {
  try {
    const resp = await daFetch(`${HLX_ADMIN}/status/${org}/${site}${pathname}`);
    if (!resp.ok) return null;
    const json = await resp.json();
    return json.preview?.status === 200;
  } catch {
    return null;
  }
}

export function getItemPreviewUrl(item, { org, site }) {
  const url = new URL(item.path || item.value);
  const { hostname, pathname } = url;

  let itemOrg = org;
  let itemSite = site;
  let itemPath = pathname;

  if (hostname.includes('.aem.')) {
    const parts = hostname.split('.')[0].split('--').reverse();
    [itemOrg, itemSite] = parts;
  } else if (hostname.includes('content.da.live')) {
    const segments = pathname.slice(1).split('/');
    [itemOrg, itemSite] = segments;
    itemPath = `/${segments.slice(2).join('/')}`;
  }

  return {
    previewUrl: `https://${ref}--${itemSite}--${itemOrg}.aem.page${itemPath}`,
    org: itemOrg,
    site: itemSite,
    pathname: itemPath,
  };
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
      await import('../nx-page-outline/nx-page-outline.js');
      return document.createElement('nx-page-outline');
    },
  };
}

function extensionToPanelView(ext, section) {
  const view = {
    id: ext.name,
    label: ext.title,
    section,
    firstParty: ext.ootb,
    experience: ext.experience,
    sources: ext.sources,
    load: async () => {
      await import('./nx-panel-extensions.js');
      const el = document.createElement('nx-panel-extension');
      el.extension = ext;
      return el;
    },
  };

  if (ext.experience === 'fullsize-dialog') {
    view.loadModal = async (container, onClose) => {
      if (ext.name === 'aem-assets') {
        const { renderAssets } = await import('./aem-assets.js');
        await renderAssets({ container, org: ext.org, site: ext.site, onClose });
        return () => {};
      }

      const iframe = document.createElement('iframe');
      iframe.className = 'ext-iframe';
      iframe.src = ext.sources?.[0] ?? '';
      iframe.title = ext.title;
      iframe.allow = 'clipboard-write *';
      container.append(iframe);

      let destroyChannel = () => {};
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
    ...library.map((ext) => extensionToPanelView(ext, 'Library')),
    ...thirdParty.map((ext) => extensionToPanelView(ext, 'Extensions')),
  ];
}
