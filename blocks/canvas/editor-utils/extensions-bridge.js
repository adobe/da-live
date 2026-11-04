/* eslint-disable import/no-unresolved -- importmap */
import { Plugin } from 'da-y-wrapper';
import { canvasBus } from '../utils/canvas-bus.js';

const bridge = { view: null, sourceUrl: null };

export function getExtensionsBridge() {
  return bridge;
}

export function createExtensionsBridgePlugin(sourceUrl = null) {
  return new Plugin({
    view(editorView) {
      bridge.view = editorView;
      bridge.sourceUrl = sourceUrl;
      return {
        update(view, prevState) {
          bridge.view = view;
          if (view.state.doc !== prevState.doc) canvasBus.editorDocState.emit();
        },
        destroy() { bridge.view = null; bridge.sourceUrl = null; },
      };
    },
  });
}
