/* eslint-disable import/no-unresolved -- importmap */
import { Plugin } from 'da-y-wrapper';
import { canvasBus } from '../utils/canvas-bus.js';

const bridge = { view: null };

export function getExtensionsBridge() {
  return bridge;
}

export function createExtensionsBridgePlugin() {
  return new Plugin({
    view(editorView) {
      bridge.view = editorView;
      return {
        update(view, prevState) {
          bridge.view = view;
          if (view.state.doc !== prevState.doc) canvasBus.editorDocState.emit();
        },
        destroy() { bridge.view = null; },
      };
    },
  });
}
