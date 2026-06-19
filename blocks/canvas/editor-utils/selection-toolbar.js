/* eslint-disable import/no-unresolved -- importmap */
import { Plugin, PluginKey, NodeSelection } from 'da-y-wrapper';
import { selectionToolbarController } from './selection-toolbar-controller.js';

const NON_TEXT_NODES = new Set(['table', 'image']);

/** Set on transactions that mirror WYSIWYG iframe text selection into ProseMirror. */
export const NX_QUICK_EDIT_IFRAME_SELECTION_META = 'nxQuickEditIframeSelection';

/** Clears iframe-origin flag when the iframe reports a caret (no range). */
export const NX_QUICK_EDIT_CLEAR_IFRAME_SELECTION_ORIGIN_META = 'nxClearQuickEditIframeSelectionOrigin';

const selectionToolbarOriginKey = new PluginKey('nxSelectionToolbarOrigin');

export function getSelectionOriginFromIframe(state) {
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
  selectionToolbarController.setInactive();
}

export function openLinkDialog(view) {
  getSelectionToolbar().openLinkDialog(view);
}

function isNonTextSelection({ selection }) {
  return selection instanceof NodeSelection
    && NON_TEXT_NODES.has(selection.node.type.name);
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
      // Mount the toolbar element so it's ready to subscribe to the controller.
      getSelectionToolbar();
      return {
        update(view) {
          // WYSIWYG-origin dispatches are owned by handlers.js — don't let
          // this plugin overwrite the controller state during them.
          if (getSelectionOriginFromIframe(view.state)) return;
          // Don't claim doc mode while wysiwyg is active; otherwise PM
          // dispatches triggered by iframe sync would flip the mode.
          if (selectionToolbarController.getState().mode === 'wysiwyg') return;
          // Require real PM focus before claiming 'doc' — without this,
          // background dispatches (collab updates, etc.) would show the
          // toolbar on a doc the user isn't actually editing.
          if (!view.hasFocus()) return;
          const { selection } = view.state;
          selectionToolbarController.setActive('doc', { view });
          selectionToolbarController.setRange(
            !selection.empty,
            { isNonTextSelection: isNonTextSelection(view.state) },
          );
        },
        destroy() {
          selectionToolbarController.setInactive();
        },
      };
    },
  });
}
