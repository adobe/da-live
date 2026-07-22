/* eslint-disable import/no-unresolved -- importmap */
import { Plugin, PluginKey, NodeSelection } from 'da-y-wrapper';
import { getTableBlockName, getTableBlockVariant } from './blocks.js';

const NON_TEXT_NODES = new Set(['table']);

/** Editor views the selection/block toolbars may appear in. */
const TOOLBAR_EDITOR_VIEWS = new Set(['content', 'split', 'layout', 'block']);

/** Set on transactions that mirror WYSIWYG iframe text selection into ProseMirror. */
export const NX_QUICK_EDIT_IFRAME_SELECTION_META = 'nxQuickEditIframeSelection';

/** Clears iframe-origin flag when the iframe reports a caret (no range). */
export const NX_QUICK_EDIT_CLEAR_IFRAME_SELECTION_ORIGIN_META = 'nxClearQuickEditIframeSelectionOrigin';

const selectionToolbarOriginKey = new PluginKey('nxSelectionToolbarOrigin');

function getSelectionOriginFromIframe(state) {
  return selectionToolbarOriginKey.getState(state)?.fromIframe ?? false;
}

let toolbar;
let componentLoaded;

export function getSelectionToolbar() {
  if (toolbar) return toolbar;
  componentLoaded ??= import('../ew-selection-toolbar/ew-selection-toolbar.js');
  toolbar = document.createElement('ew-selection-toolbar');
  document.body.append(toolbar);
  return toolbar;
}

let blockToolbar;
let blockComponentLoaded;

export function getBlockToolbar() {
  if (blockToolbar) return blockToolbar;
  blockComponentLoaded ??= import('../ew-block-toolbar/ew-block-toolbar.js');
  blockToolbar = document.createElement('ew-block-toolbar');
  document.body.append(blockToolbar);
  return blockToolbar;
}

export function hideBlockToolbar() {
  blockToolbar?.hide?.();
}

export function setSelectionToolbarCtx({ org = null, site = null, sourceUrl = null } = {}) {
  const tb = getSelectionToolbar();
  tb.org = org;
  tb.site = site;
  tb.sourceUrl = sourceUrl;
  const blockTb = getBlockToolbar();
  blockTb.org = org;
  blockTb.site = site;
}

export function hideSelectionToolbar() {
  toolbar?.hide?.();
}

export function openLinkDialog(view) {
  getSelectionToolbar().openLinkDialog(view);
}

export function openAltDialog() {
  getSelectionToolbar().openAltDialog();
}

export function triggerAddImage() {
  getSelectionToolbar().triggerAddImage();
}

function isNonTextSelection({ selection }) {
  return selection instanceof NodeSelection
    && NON_TEXT_NODES.has(selection.node.type.name);
}

function syncToolbar(view, editorView) {
  if (!view) return;
  const tb = getSelectionToolbar();
  if (tb.linkDialogOpen || tb.altDialogOpen || tb.isInteracting) return;
  if (isNonTextSelection(view.state)) {
    // A block is selected — show the block toolbar in every editor view.
    hideSelectionToolbar();
    const blockTb = getBlockToolbar();
    blockTb.view = view;
    const { node } = view.state.selection;
    blockTb.show(getTableBlockName(node), getTableBlockVariant(node));
    return;
  }
  hideBlockToolbar();
  // The text toolbar is only relevant when the doc editor is visible, and never
  // for selections that originate in (and are already served by) the WYSIWYG iframe.
  if (getSelectionOriginFromIframe(view.state)) return;
  if (editorView === 'layout') return;
  if (!view.hasFocus()) return;
  tb.view = view;
  tb.show();
}

export function createSelectionToolbarPlugin() {
  return new Plugin({
    key: selectionToolbarOriginKey,
    state: {
      init: () => ({ fromIframe: false }),
      apply(tr, prev) {
        if (tr.getMeta(NX_QUICK_EDIT_IFRAME_SELECTION_META)) return { fromIframe: true };
        if (tr.getMeta(NX_QUICK_EDIT_CLEAR_IFRAME_SELECTION_ORIGIN_META)) {
          return { fromIframe: false };
        }
        if (tr.selectionSet) return { fromIframe: false };
        return prev;
      },
    },
    view() {
      return {
        update(view) {
          const header = document.querySelector('ew-canvas-header');
          const ev = header?.editorView;
          if (!TOOLBAR_EDITOR_VIEWS.has(ev)) return;
          syncToolbar(view, ev);
        },
        destroy() {
          hideSelectionToolbar();
          hideBlockToolbar();
        },
      };
    },
  });
}
