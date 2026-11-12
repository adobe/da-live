import { DOMParser as PMDOMParser } from 'da-y-wrapper';
import { fetchVersionHtml } from '../../shared/version/version-actions.js';
import { docToHtml } from '../../shared/version/compare.js';
import { getExtensionsBridge } from './extensions-bridge.js';
import { trackingPluginKey } from './prose-diff.js';
import { canvasBus } from '../utils/canvas-bus.js';

const getView = () => getExtensionsBridge().view;

function getCanvasSection() {
  return document.querySelector('ew-canvas-header')?.parentElement
    ?? document.querySelector('.nx-canvas-editor-mount');
}

function getChatPanel() {
  return document.querySelector('aside.panel[data-position="before"]:not([hidden])');
}

/** Adapts the canvas ProseMirror document to the editor port of the shared Version history. */
export default function createCanvasVersionsEditor() {
  return {
    canWrite: () => getView()?.editable ?? false,
    subscribe: (listener) => canvasBus.editorHtmlState.subscribe(() => listener()),
    fetchVersion: fetchVersionHtml,
    getCurrentHtml: () => {
      const view = getView();
      return view ? docToHtml(view) : null;
    },
    restore: async (path, entry) => {
      const view = getView();
      if (!view) {
        return false;
      }

      const versionBody = await fetchVersionHtml(path, entry);
      if (!versionBody) {
        return false;
      }

      const newDoc = PMDOMParser.fromSchema(view.state.schema).parse(versionBody);
      const tr = view.state.tr
        .replaceWith(0, view.state.doc.content.size, newDoc.content)
        .setMeta(trackingPluginKey, true);
      view.dispatch(tr);
      return true;
    },
    // A comparison covers the editor and, when open, the chat beside it.
    getCompareArea: () => {
      const section = getCanvasSection();
      return section ? [section, getChatPanel()] : [];
    },
  };
}
