/* eslint-disable import/no-unresolved -- importmap */
import { Plugin } from 'da-y-wrapper';
import { canvasBus } from '../utils/canvas-bus.js';

const bridge = { view: null, forceSave: null };

export function getExtensionsBridge() {
  return bridge;
}

export function createExtensionsBridgePlugin({ forceSave = null } = {}) {
  return new Plugin({
    view(editorView) {
      bridge.view = editorView;
      bridge.forceSave = forceSave;
      return {
        update(view, prevState) {
          bridge.view = view;
          if (view.state.doc !== prevState.doc) canvasBus.editorDocState.emit();
        },
        destroy() {
          if (bridge.view !== editorView) return;
          bridge.view = null;
          bridge.forceSave = null;
        },
      };
    },
  });
}
