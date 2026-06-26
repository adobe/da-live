import { getNx } from '../../scripts/utils.js';
import { editorSelectChange } from './editor-utils/editor-utils.js';
import {
  normalizeCanvasEditorView,
  readInitialCanvasEditorView,
  persistCanvasEditorView,
} from './utils/view.js';
import { shouldAutoOpenAfterPanel } from './utils/panel.js';
import './ew-canvas-header/ew-canvas-header.js';
import './ew-editor-doc/ew-editor-doc.js';
import './ew-editor-wysiwyg/ew-editor-wysiwyg.js';
import {
  syncEditorSplitLayout,
  finalizeSplitEditorMountOrder,
  installEditorSplitDrag,
  removeSplitGutter,
} from './ew-editor-split/ew-editor-split.js';
import { resolveEditorDocSession } from './ew-editor-doc/utils/load-editor-doc.js';
import { sourceUrlFromEditorCtx } from './ew-editor-doc/utils/ctx.js';
import { SEL_BLOCK, SEL_ITEM, SEL_TEXT } from './ew-editor-doc/utils/selection.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);
const { getPanelStore, openPanel } = await import(`${getNx()}/utils/panel.js`);

const style = await loadStyle(import.meta.url);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];

function buildCanvasDocPath(state) {
  const { org, site, path } = state || {};
  if (!org || !site || !path) return null;
  return `${org}/${site}/${path}`;
}

function notifyCanvasEditorActive(mountRoot, view) {
  const v = normalizeCanvasEditorView(view);
  mountRoot.dispatchEvent(new CustomEvent('nx-canvas-editor-active', {
    bubbles: false,
    detail: { view: v },
  }));
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

function showNotPermitted(mountRoot, message) {
  let el = mountRoot.querySelector('.nx-not-permitted');
  if (!el) {
    el = document.createElement('div');
    el.className = 'nx-not-permitted';
    mountRoot.append(el);
  }
  el.textContent = message;
}

function removeNotPermitted(mountRoot) {
  mountRoot.querySelector('.nx-not-permitted')?.remove();
}

// Incremented on each load to prevent stale network requests
// from overwriting the current editor session.
let editorLoadCount = 0;

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

async function syncCanvasEditorsToHash({ mountRoot, header, state }) {
  editorLoadCount += 1;
  const loadCount = editorLoadCount;
  header.undoAvailable = false;
  header.redoAvailable = false;
  const fullPath = buildCanvasDocPath(state);
  const name = state?.path?.split('/').pop();
  document.title = `${name ? `Edit ${name} | ` : ''}Experience Workspace`;
  if (!fullPath) {
    removeCanvasEditors(mountRoot);
    removeNotPermitted(mountRoot);
    header.authorized = true;
    return;
  }
  const ctx = editorCtxFromHashState(state, fullPath);
  const session = await resolveEditorDocSession(sourceUrlFromEditorCtx(ctx));
  if (loadCount !== editorLoadCount) return;
  if (!session.ok) {
    removeCanvasEditors(mountRoot);
    showNotPermitted(mountRoot, session.error);
    header.authorized = false;
    return;
  }
  removeNotPermitted(mountRoot);
  header.authorized = true;
  const docEl = ensureNxEditorDoc(mountRoot);
  docEl.session = session;
  docEl.ctx = ctx;
  ensureNxEditorWysiwyg(mountRoot).ctx = ctx;
  finalizeSplitEditorMountOrder(mountRoot);
  notifyCanvasEditorActive(mountRoot, header.editorView);
  syncEditorSplitLayout({ mountRoot, view: header.editorView });
}

async function syncToolPanelViews(toolPanel, { org, site }) {
  const key = org && site ? `${org}/${site}` : null;
  if (key === toolPanel.dataset.extKey) return;
  toolPanel.dataset.extKey = key ?? '';

  if (!key) {
    toolPanel.org = undefined;
    toolPanel.site = undefined;
    toolPanel.views = [];
    return;
  }

  const { getCanvasToolPanelViews } = await import('./ew-panel-extensions/helpers.js');
  const views = await getCanvasToolPanelViews({ org, site });
  if (toolPanel.dataset.extKey !== key) return;
  toolPanel.org = org;
  toolPanel.site = site;
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
  if (!config) return undefined;
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
  return aside;
}

async function installCanvasHeader(block, { org, site }) {
  const header = document.createElement('ew-canvas-header');
  header.editorView = await readInitialCanvasEditorView({ org, site });
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

export default async function decorate(block) {
  const { org, site } = hashState();
  const header = await installCanvasHeader(block, { org, site });

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
  });

  document.addEventListener('nx-open-chat-panel', async ({ detail }) => {
    const aside = await openCanvasPanel('before');
    if (!detail?.text) return;
    aside?.querySelector('nx-chat')?.setPrompt(detail.text, { autoSend: detail.autoSend });
  });

  const store = getPanelStore();
  if (store.before && !store.before.fragment) openCanvasPanel('before');
  if (store.after && !store.after.fragment) {
    openCanvasPanel('after');
  } else {
    shouldAutoOpenAfterPanel({ org, site }).then((open) => {
      if (open) openCanvasPanel('after');
    });
  }

  // Any non-empty selection in doc mode is sent as chat context.
  // wysiwyg has no block-select equivalent yet — see docs/canvas-events.md.
  const CANVAS_CHAT_KEY = 'canvas-selection';
  const SELECTION_LABEL = 'Selection';
  let hasContext = false;
  editorSelectChange.subscribe(({
    blockIndex, blockName, proseIndex, innerText, source,
    selectionType, selectedHTML, selFrom, selTo,
  }) => {
    if (source !== 'doc') return;
    const isBlock = selectionType === SEL_BLOCK && blockIndex >= 0 && !!blockName;
    const isContent = selectionType === SEL_TEXT || selectionType === SEL_ITEM;
    if (!isBlock && !isContent) {
      if (hasContext) {
        hasContext = false;
        document.dispatchEvent(new CustomEvent('nx-add-to-chat', { detail: { key: CANVAS_CHAT_KEY } }));
      }
      return;
    }
    hasContext = true;
    const detail = isBlock
      ? {
        key: CANVAS_CHAT_KEY,
        id: CANVAS_CHAT_KEY,
        type: SEL_BLOCK,
        label: blockName,
        blockName,
        proseIndex,
        innerText,
        selectionType,
        selFrom,
        selTo,
        pinnable: true,
      }
      : {
        key: CANVAS_CHAT_KEY,
        id: CANVAS_CHAT_KEY,
        type: SEL_TEXT,
        label: SELECTION_LABEL,
        proseIndex: typeof proseIndex === 'number' ? proseIndex : selFrom,
        innerHTML: selectedHTML,
        selectionType,
        selFrom,
        selTo,
        pinnable: true,
      };
    document.dispatchEvent(new CustomEvent('nx-add-to-chat', { detail }));
  });
}
