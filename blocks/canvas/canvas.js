import { getNx, loadStyle, hashChange, getPanelStore, openPanel } from '../shared/nxutils.js';
import './nx-canvas-header/nx-canvas-header.js';
import './nx-editor-doc/nx-editor-doc.js';
import './nx-editor-wysiwyg/nx-editor-wysiwyg.js';
import {
  syncEditorSplitLayout,
  finalizeSplitEditorMountOrder,
  installEditorSplitDrag,
  removeSplitGutter,
} from './nx-editor-split/nx-editor-split.js';

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
  mountRoot.querySelector('nx-editor-doc')?.remove();
  mountRoot.querySelector('nx-editor-wysiwyg')?.remove();
}

function ensureNxEditorDoc(mountRoot) {
  let el = mountRoot.querySelector('nx-editor-doc');
  if (!el) {
    el = document.createElement('nx-editor-doc');
    mountRoot.append(el);
  }
  return el;
}

function ensureNxEditorWysiwyg(mountRoot) {
  let frame = mountRoot.querySelector('nx-editor-wysiwyg');
  if (!frame) {
    frame = document.createElement('nx-editor-wysiwyg');
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

  const { getCanvasToolPanelViews } = await import('./nx-panel-extensions/helpers.js');
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
      await import(`${getNx()}/blocks/tool-panel/tool-panel.js`);
      return document.createElement('nx-tool-panel');
    },
  },
};

function hashState() {
  const [org, site] = window.location.hash.slice(2).split('/');
  return { org: org || undefined, site: site || undefined };
}

async function openCanvasPanel(position, { preferredViewId } = {}) {
  const config = CANVAS_PANELS[position];
  if (!config) return;
  const store = getPanelStore();
  const width = store[position]?.width ?? config.width;
  const aside = await openPanel({ position, width, getContent: config.getContent });
  if (position === 'after') {
    const toolPanel = aside?.querySelector('nx-tool-panel');
    if (toolPanel) {
      await syncToolPanelViews(toolPanel, hashState());
      await toolPanel.updateComplete;
      if (preferredViewId && toolPanel.views?.some((v) => v.id === preferredViewId)) {
        await toolPanel.showView(preferredViewId);
      }
    }
  }
}

function installCanvasHeader(block) {
  const header = document.createElement('nx-canvas-header');
  header.editorView = readPersistedCanvasEditorView();
  header.addEventListener('nx-canvas-open-panel', (e) => {
    openCanvasPanel(e.detail.position, { preferredViewId: e.detail.viewId });
  });
  header.addEventListener('nx-canvas-editor-view', (e) => {
    const view = normalizeCanvasEditorView(e.detail?.view);
    persistCanvasEditorView(view);
    const applyTarget = canvasHeaderApplyTarget(block);
    notifyCanvasEditorActive(applyTarget, view);
    syncEditorSplitLayout({ mountRoot: canvasEditorMountRoot(block), view });
  });
  header.addEventListener('nx-canvas-undo', () => {
    canvasEditorMountRoot(block).querySelector('nx-editor-doc')?.undo();
  });
  header.addEventListener('nx-canvas-redo', () => {
    canvasEditorMountRoot(block).querySelector('nx-editor-doc')?.redo();
  });
  block.before(header);
  return header;
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
    const toolPanel = document.querySelector('aside.panel[data-position="after"] nx-tool-panel');
    if (toolPanel) syncToolPanelViews(toolPanel, state);
  });

  const store = getPanelStore();
  if (store.before && !store.before.fragment) openCanvasPanel('before');
  if (store.after && !store.after.fragment) openCanvasPanel('after');
}
