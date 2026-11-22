/* eslint-disable import/no-unresolved -- importmap */
import { Plugin } from 'da-y-wrapper';
import { canvasBus } from '../utils/canvas-bus.js';

const bridge = { view: null };
let scopedView;

function clearStaleScopedView() {
  if (!scopedView || bridge.view !== scopedView.view || scopedView.isCurrent()) return;
  bridge.view = null;
  scopedView = null;
  canvasBus.editorHtmlState.emit('');
}

export function getExtensionsBridge() {
  clearStaleScopedView();
  return bridge;
}

export function createExtensionsBridgePlugin({ isCurrent } = {}) {
  return new Plugin({
    view(editorView) {
      if (!isCurrent || isCurrent()) {
        bridge.view = editorView;
        scopedView = isCurrent ? { view: editorView, isCurrent } : null;
      }
      if (isCurrent) window.addEventListener('hashchange', clearStaleScopedView);
      return {
        update(view, prevState) {
          clearStaleScopedView();
          if (bridge.view !== editorView) return;
          if (view.state.doc !== prevState.doc) canvasBus.editorDocState.emit();
        },
        destroy() {
          if (isCurrent) window.removeEventListener('hashchange', clearStaleScopedView);
          if (bridge.view === editorView) {
            bridge.view = null;
            scopedView = null;
          }
        },
      };
    },
  });
}
