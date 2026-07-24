/* eslint-disable import/no-unresolved -- importmap */
import { Plugin, PluginKey, NodeSelection } from 'da-y-wrapper';
import { toolbarController } from './toolbar-controller.js';

const NON_TEXT_NODES = new Set(['table']);

/** Set on transactions that mirror WYSIWYG iframe text selection into ProseMirror. */
export const NX_QUICK_EDIT_IFRAME_SELECTION_META = 'nxQuickEditIframeSelection';

/** Clears iframe-origin flag when the iframe reports a caret (no range). */
export const NX_QUICK_EDIT_CLEAR_IFRAME_SELECTION_ORIGIN_META = 'nxClearQuickEditIframeSelectionOrigin';

const selectionToolbarOriginKey = new PluginKey('nxSelectionToolbarOrigin');

export function getSelectionOriginFromIframe(state) {
  return selectionToolbarOriginKey.getState(state)?.fromIframe ?? false;
}

export function setSelectionToolbarCtx({ org = null, site = null, sourceUrl = null } = {}) {
  const tb = toolbarController.ensureToolbar();
  tb.org = org;
  tb.site = site;
  tb.sourceUrl = sourceUrl;
}

export function openLinkDialog(view) {
  toolbarController.ensureToolbar().openLinkDialog(view);
}

export function openAltDialog() {
  toolbarController.ensureToolbar().openAltDialog();
}

export function triggerAddImage() {
  toolbarController.ensureToolbar().triggerAddImage();
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
      return {
        update(view) {
          // Iframe-origin dispatches are owned by the wysiwyg handlers; the doc
          // plugin only reports the *doc* selection, and never claims the surface
          // (activation comes from real focus — see toolbar-controller.js).
          if (getSelectionOriginFromIframe(view.state)) return;
          toolbarController.setDocSelection({ showable: !isNonTextSelection(view.state) });
        },
        destroy() {
          toolbarController.reset();
        },
      };
    },
  });
}
