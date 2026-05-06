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

export const TOOLBAR_PADDING_GAP = 64;

let toolbar;
let componentLoaded;

export function getSelectionToolbar() {
  if (toolbar) return toolbar;
  componentLoaded ??= import('./nx-selection-toolbar.js');
  toolbar = document.createElement('nx-selection-toolbar');
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
  if (tb.linkDialogOpen) return;
  if (view.state.selection.empty || isNonTextSelection(view.state)) {
    hideSelectionToolbar();
    return;
  }
  const start = view.coordsAtPos(view.state.selection.from);
  tb.view = view;
  tb.show({ x: start.left, y: start.top - TOOLBAR_PADDING_GAP });
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
      let scrollEl;
      const tb = getSelectionToolbar();
      const onScroll = () => {
        if (tb.view && getSelectionOriginFromIframe(tb.view.state)) return;
        syncToolbar(tb.view);
      };

      return {
        update(view) {
          if (!scrollEl) {
            scrollEl = view.dom.closest('.nx-editor-doc');
            scrollEl?.addEventListener('scroll', onScroll, { passive: true });
          }
          const header = document.querySelector('nx-canvas-header');
          const ev = header?.editorView;
          if (ev !== 'content' && ev !== 'split') return;
          if (getSelectionOriginFromIframe(view.state)) return;
          syncToolbar(view);
        },
        destroy() {
          scrollEl?.removeEventListener('scroll', onScroll);
          hideSelectionToolbar();
        },
      };
    },
  });
}
