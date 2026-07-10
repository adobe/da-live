/* eslint-disable import/no-unresolved -- importmap */
import { Plugin } from 'da-y-wrapper';

const bridge = { view: null, permissions: undefined, ydoc: undefined };

export function getExtensionsBridge() {
  return bridge;
}

export function setExtensionsBridgeContext({ permissions, ydoc } = {}) {
  bridge.permissions = permissions;
  bridge.ydoc = ydoc;
}

export function createExtensionsBridgePlugin() {
  return new Plugin({
    view(editorView) {
      bridge.view = editorView;
      return {
        update(view) { bridge.view = view; },
        destroy() { bridge.view = null; },
      };
    },
  });
}
