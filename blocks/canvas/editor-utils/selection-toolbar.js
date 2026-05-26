/* eslint-disable import/no-unresolved -- importmap */
import { Plugin, PluginKey, NodeSelection } from 'da-y-wrapper';

const NON_TEXT_NODES = new Set(['table', 'image']);

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

export function hideSelectionToolbar() {
  toolbar?.hide?.();
}

function isNonTextSelection({ selection }) {
  return selection instanceof NodeSelection
    && NON_TEXT_NODES.has(selection.node.type.name);
}

function syncToolbar(view) {
  if (!view) return;
  const tb = getSelectionToolbar();
  if (tb.linkDialogOpen || tb.isInteracting) return;
  if (isNonTextSelection(view.state)) {
    hideSelectionToolbar();
    return;
  }
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
          if (ev !== 'content' && ev !== 'split') return;
          if (getSelectionOriginFromIframe(view.state)) return;
          syncToolbar(view);
        },
        destroy() {
          hideSelectionToolbar();
        },
      };
    },
  });
}
