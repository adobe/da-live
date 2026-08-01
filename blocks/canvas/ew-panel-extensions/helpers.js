/* eslint-disable import/no-unresolved -- importmap */
import { DOMParser as PMDOMParser, DOMSerializer, Slice, TextSelection } from 'da-y-wrapper';
import { getNx } from '../../../scripts/utils.js';
import { aemAdmin, daFetch } from '../../shared/utils.js';
import { htmlToProse } from '../../edit/utils/helpers.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';
import { fetchExtensions } from '../../shared/block-library.js';

const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const { fetchDaConfigs, getFirstSheet } = await import(`${getNx()}/utils/daConfig.js`);

const ref = new URLSearchParams(window.location.search).get('ref') || 'main';

const REPLACE_CONTENT = '<content>';

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

function mergePlugin(list, plugin) {
  let idx = list.findIndex((p) => p.name === 'templates');
  if (idx === -1) idx = list.findIndex((p) => p.name === 'blocks');
  if (idx !== -1) {
    list.splice(idx + 1, 0, plugin);
  } else {
    list.push(plugin);
  }
}

// AEM Assets is a canvas-only panel plugin, layered on top of the shared library
// extensions when the site has a repository configured.
async function addAemAssetsPlugin(extensions, org, site) {
  try {
    const configs = await Promise.all(fetchDaConfigs({ org, site }));
    const validConfigs = configs.filter((conf) => !conf?.error);
    const entries = validConfigs.flatMap((conf) => getFirstSheet(conf) || []);
    const hasRepo = entries.find((entry) => entry.key === 'aem.repositoryId')?.value;
    if (!hasRepo) return;
    const { getAssetsPlugin } = await import('./aem-assets.js');
    const plugin = getAssetsPlugin({ org, site });
    if (plugin) mergePlugin(extensions, plugin);
  } catch { /* proceed without assets */ }
}

export async function fetchItems(sources, format) {
  const items = [];
  for (const source of sources) {
    try {
      const resp = await daFetch(source, { noRedirect: true });
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
  const { dom } = htmlToProse(html);
  const parsed = PMDOMParser.fromSchema(view.state.schema).parse(dom);
  view.dispatch(view.state.tr.replaceSelectionWith(parsed).scrollIntoView());
}

// ---------------------------------------------------------------------------
// Preview status
// ---------------------------------------------------------------------------

export async function getPreviewStatus({ org, site, pathname }) {
  const path = `/${org}/${site}${pathname}`;
  try {
    const json = await aemAdmin(path, 'status', 'GET');
    if (!json) return null;
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

export function extensionToPanelView(ext, section) {
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
    experience: ext.experience,
    sources: ext.sources,
    icon: ext.icon,
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
      iframe.src = ext.sources?.[0] ?? '';
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
  await addAemAssetsPlugin(extensions, org, site);
  const library = sortLibraryExtensions(extensions.filter(isLibraryExtension));
  const thirdParty = extensions.filter((ext) => !isLibraryExtension(ext));

  return [
    createOutlineView(),
    createFileExplorerView(),
    createVersioningView(),
    ...library.map((ext) => extensionToPanelView(ext, 'Library')),
    ...thirdParty.map((ext) => extensionToPanelView(ext, 'Extensions')),
  ];
}
