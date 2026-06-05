import { getNx } from '../../scripts/utils.js';
import { editorSelectChange } from './editor-utils/editor-utils.js';
import './ew-canvas-header/ew-canvas-header.js';
import './ew-editor-doc/ew-editor-doc.js';
import './ew-editor-wysiwyg/ew-editor-wysiwyg.js';
import {
  syncEditorSplitLayout,
  finalizeSplitEditorMountOrder,
  installEditorSplitDrag,
  removeSplitGutter,
} from './ew-editor-split/ew-editor-split.js';
import { initIms } from '../shared/utils.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);
const { getPanelStore, openPanel } = await import(`${getNx()}/utils/panel.js`);

const style = await loadStyle(import.meta.url);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];

function buildCanvasDocPath(state) {
  const { org, site, path } = state || {};
  if (!org || !site || !path) return null;
  return `${org}/${site}/${path}`;
}

const CANVAS_EDITOR_VIEW_KEY = 'nx-canvas-editor-view';

function normalizeCanvasEditorView(view) {
  if (view === 'content') return 'content';
  if (view === 'split') return 'split';
  return 'layout';
}

function notifyCanvasEditorActive(mountRoot, view) {
  const v = normalizeCanvasEditorView(view);
  mountRoot.dispatchEvent(new CustomEvent('nx-canvas-editor-active', {
    bubbles: false,
    detail: { view: v },
  }));
}

function readPersistedCanvasEditorView() {
  try {
    return normalizeCanvasEditorView(sessionStorage.getItem(CANVAS_EDITOR_VIEW_KEY));
  } catch {
    return 'layout';
  }
}

function persistCanvasEditorView(view) {
  try {
    sessionStorage.setItem(CANVAS_EDITOR_VIEW_KEY, normalizeCanvasEditorView(view));
  } catch {
    /* ignore if browser disallows session storage */
  }
}

function canvasEditorMountRoot(block) {
  return block.querySelector('.default-content') || block;
}

function canvasHeaderApplyTarget(block) {
  return block.querySelector('.nx-canvas-editor-mount')
    || block.querySelector('.default-content')
    || block;
}

function removeCanvasEditors(mountRoot) {
  removeSplitGutter(mountRoot);
  mountRoot.querySelector('ew-editor-doc')?.remove();
  mountRoot.querySelector('ew-editor-wysiwyg')?.remove();
}

function ensureNxEditorDoc(mountRoot) {
  let el = mountRoot.querySelector('ew-editor-doc');
  if (!el) {
    el = document.createElement('ew-editor-doc');
    mountRoot.append(el);
  }
  return el;
}

function ensureNxEditorWysiwyg(mountRoot) {
  let frame = mountRoot.querySelector('ew-editor-wysiwyg');
  if (!frame) {
    frame = document.createElement('ew-editor-wysiwyg');
    mountRoot.append(frame);
  }
  return frame;
}

function editorCtxFromHashState(state, fullPath) {
  return { org: state.org, repo: state.site, path: fullPath };
}

function syncCanvasEditorsToHash({ mountRoot, header, state }) {
  header.undoAvailable = false;
  header.redoAvailable = false;
  const fullPath = buildCanvasDocPath(state);
  const name = state?.path?.split('/').pop();
  document.title = `${name ? `Edit ${name} | ` : ''}Experience Workspace`;
  if (!fullPath) {
    removeCanvasEditors(mountRoot);
    return;
  }
  const ctx = editorCtxFromHashState(state, fullPath);
  ensureNxEditorWysiwyg(mountRoot).ctx = ctx;
  ensureNxEditorDoc(mountRoot).ctx = ctx;
  finalizeSplitEditorMountOrder(mountRoot);
  notifyCanvasEditorActive(mountRoot, header.editorView);
  syncEditorSplitLayout({ mountRoot, view: header.editorView });
}

async function syncToolPanelViews(toolPanel, { org, site }) {
  const key = org && site ? `${org}/${site}` : null;
  if (key === toolPanel.dataset.extKey) return;
  toolPanel.dataset.extKey = key ?? '';

  if (!key) {
    toolPanel.views = [];
    return;
  }

  const { getCanvasToolPanelViews } = await import('./ew-panel-extensions/helpers.js');
  const views = await getCanvasToolPanelViews({ org, site });
  if (toolPanel.dataset.extKey !== key) return;
  toolPanel.views = views;
}

const CANVAS_PANELS = {
  before: {
    width: '400px',
    getContent: async () => {
      await import(`${getNx()}/blocks/chat/chat.js`);
      return document.createElement('nx-chat');
    },
  },
  after: {
    width: '400px',
    getContent: async () => {
      await import('./ew-tool-panel/tool-panel.js');
      return document.createElement('ew-tool-panel');
    },
  },
};

function hashState() {
  const [org, site] = window.location.hash.slice(2).split('/');
  return { org: org || undefined, site: site || undefined };
}

async function openCanvasPanel(position, { panelName } = {}) {
  const config = CANVAS_PANELS[position];
  if (!config) return;
  const store = getPanelStore();
  const width = store[position]?.width ?? config.width;
  const aside = await openPanel({ position, width, getContent: config.getContent });
  if (position === 'after') {
    const toolPanel = aside?.querySelector('ew-tool-panel');
    if (toolPanel) {
      await syncToolPanelViews(toolPanel, hashState());
      await toolPanel.updateComplete;
      if (panelName && toolPanel.views?.some((v) => v.id === panelName)) {
        await toolPanel.showPanel(panelName);
      }
    }
  }
}

function installCanvasHeader(block) {
  const header = document.createElement('ew-canvas-header');
  header.editorView = readPersistedCanvasEditorView();
  header.addEventListener('nx-canvas-open-panel', (e) => {
    openCanvasPanel(e.detail.position, { panelName: e.detail.panelName });
  });
  header.addEventListener('nx-canvas-editor-view', (e) => {
    const view = normalizeCanvasEditorView(e.detail?.view);
    persistCanvasEditorView(view);
    const applyTarget = canvasHeaderApplyTarget(block);
    notifyCanvasEditorActive(applyTarget, view);
    syncEditorSplitLayout({ mountRoot: canvasEditorMountRoot(block), view });
  });
  header.addEventListener('nx-canvas-undo', () => {
    canvasEditorMountRoot(block).querySelector('ew-editor-doc')?.undo();
  });
  header.addEventListener('nx-canvas-redo', () => {
    canvasEditorMountRoot(block).querySelector('ew-editor-doc')?.redo();
  });
  block.before(header);
  return header;
}

async function exchangeSiteToken(org, site, accessToken) {
  try {
    const response = await fetch('https://admin.hlx.page/auth/adobe/exchange', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        org,
        site,
        accessToken,
      }),
    });

    if (!response.ok) {
      // 401/403 error cases
      return null;
    }

    const data = await response.json();

    // If site doesn't require auth, data will be empty object
    if (!data.siteToken) {
      return null;
    }

    return {
      siteToken: data.siteToken,
      siteTokenExpiry: data.siteTokenExpiry,
    };
  } catch (error) {
    console.error('Error exchanging site token:', error);
    return null;
  }
}

async function broadcastArticleIndex(org, site) {
  try {
    const token = (await initIms())?.accessToken?.token;
    if (!token) return;
    const siteToken = await exchangeSiteToken(org, site, token);
    if (!siteToken) return;
    const url = `https://main--${site}--${org}.preview.da.live/blog/article-index.json`;
    const resp = await fetch(url, { method: 'GET', headers: { 'x-site-token': `token ${siteToken.siteToken}`, 'Content-Type': 'application/json' } });

    if (!resp.ok) return;
    const json = await resp.json();
    const ids = (json.data ?? []).map((r) => r.observationid).filter(Boolean);
    if (!ids.length) return;
    const toolPanel = document.querySelector('aside.panel[data-position="after"] ew-tool-panel');
    toolPanel?.shadowRoot?.querySelectorAll('ew-panel-extension').forEach((ext) => {
      const iframe = ext.shadowRoot?.querySelector('iframe') ?? ext.querySelector('iframe');
      iframe?.contentWindow?.postMessage({ type: 'nx-completed-obs', ids }, '*');
    });
  } catch { /* ignore */ }
}

export default async function decorate(block) {
  const header = installCanvasHeader(block);

  const mountRoot = canvasEditorMountRoot(block);
  mountRoot.classList.add('nx-canvas-editor-mount');
  syncEditorSplitLayout({ mountRoot, view: header.editorView });
  installEditorSplitDrag(mountRoot);

  mountRoot.addEventListener('nx-editor-undo-state', (e) => {
    header.undoAvailable = e.detail?.canUndo ?? false;
    header.redoAvailable = e.detail?.canRedo ?? false;
  });

  hashChange.subscribe((state) => {
    syncCanvasEditorsToHash({ mountRoot, header, state });
    const toolPanel = document.querySelector('aside.panel[data-position="after"] ew-tool-panel');
    if (toolPanel) syncToolPanelViews(toolPanel, state);
    if (state?.org && state?.site) broadcastArticleIndex(state.org, state.site);
  });

  window.addEventListener('message', async ({ data }) => {
    if (data?.type === 'nx-open-chat') {
      openCanvasPanel('before');
      return;
    }
    if (data?.type === 'nx-show-obs-details') {
      await Promise.all([
        import('../shared/da-dialog/da-dialog.js'),
        import('./ew-obs-details/ew-obs-details.js'),
      ]);
      const daDialog = document.createElement('da-dialog');
      daDialog.title = data.obs?.name ?? 'Observation';
      daDialog.addEventListener('close', () => daDialog.remove());
      const el = document.createElement('ew-obs-details');
      el.obs = data.obs;
      daDialog.append(el);
      document.body.append(daDialog);
      return;
    }
    if (data?.type !== 'nx-show-draft-preview') return;
    await Promise.all([
      import('../shared/da-dialog/da-dialog.js'),
      import('./ew-draft-preview/ew-draft-preview.js'),
    ]);
    const daDialog = document.createElement('da-dialog');
    daDialog.title = 'Preview';
    daDialog.addEventListener('close', () => daDialog.remove());
    const el = document.createElement('ew-draft-preview');
    el.obsId = data.obsId;
    el.items = data.items;
    el.org = data.org;
    el.site = data.site;
    el.onClose = () => daDialog.close();
    daDialog.append(el);
    document.body.append(daDialog);
  });

  const store = getPanelStore();
  if (store.before && !store.before.fragment) openCanvasPanel('before');
  if (store.after && !store.after.fragment) openCanvasPanel('after');

  // Only NodeSelection (explicit block handle click) in doc mode qualifies as intentional context.
  // wysiwyg has no block-select equivalent yet — see docs/canvas-events.md.
  const CANVAS_CHAT_KEY = 'canvas-selection';
  let hasExplicitBlock = false;
  editorSelectChange.subscribe(({
    blockIndex, blockName, proseIndex, innerText, source, explicit,
  }) => {
    if (source !== 'doc') return;
    if (!explicit) {
      if (hasExplicitBlock) {
        hasExplicitBlock = false;
        document.dispatchEvent(new CustomEvent('nx-add-to-chat', { detail: { key: CANVAS_CHAT_KEY } }));
      }
      return;
    }
    const hasBlock = blockIndex >= 0 && !!blockName;
    hasExplicitBlock = hasBlock;
    const detail = hasBlock
      ? {
        key: CANVAS_CHAT_KEY,
        id: CANVAS_CHAT_KEY,
        label: blockName,
        blockName,
        proseIndex,
        innerText,
      }
      : { key: CANVAS_CHAT_KEY };
    document.dispatchEvent(new CustomEvent('nx-add-to-chat', { detail }));
  });
}
