/* eslint-disable import/no-unresolved -- importmap */
import { Plugin } from 'da-y-wrapper';
import { canvasBus } from '../utils/canvas-bus.js';
import { updateEditorSession, closeEditorSession } from './editor-sdk.js';

const bridge = { view: null, sourceUrl: null };

export function getExtensionsBridge() {
  return bridge;
}

export function createExtensionsBridgePlugin(sourceUrl = null, serializeHtml = null) {
  return new Plugin({
    view(editorView) {
      bridge.view = editorView;
      bridge.sourceUrl = sourceUrl;
      updateEditorSession(editorView, { reset: true, serializeHtml });
      return {
        update(view, prevState) {
          bridge.view = view;
          if (view.state.doc !== prevState.doc) canvasBus.editorDocState.emit();
          updateEditorSession(view);
        },
        destroy() {
          closeEditorSession(editorView);
          if (bridge.view === editorView) {
            bridge.view = null;
            bridge.sourceUrl = null;
          }
        },
      };
    },
  });
}
