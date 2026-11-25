import {
  EditorState,
  Y,
  ySyncPluginKey,
  yUndoPluginKey,
} from 'da-y-wrapper';
import {
  aem2doc,
  doc2aem,
  getSchema,
  prosemirrorToYXmlFragment,
  yDocToProsemirror,
} from 'da-parser';

let engine;
let loading;

export function loadDiffEngine() {
  loading ??= import('../../../../deps/da-merge/dist/resolve.js')
    .then((mod) => {
      const parser = mod.daParserAdapter({
        Y, EditorState, aem2doc, doc2aem, getSchema, yDocToProsemirror, prosemirrorToYXmlFragment,
      });
      engine = { ...mod, ...mod.createResolve({ DOMParser, ...parser }) };
      return engine;
    })
    .catch((error) => {
      loading = undefined;
      throw error;
    });
  return loading;
}

export const getDiffEngine = () => engine;

function currentSite() {
  const path = window.location.hash.split('#').find((part) => part.startsWith('/'));
  return path?.split('/')[2] || undefined;
}

export function applyResolution(view, method, options) {
  const tr = engine[method]({ state: view.state, site: currentSite(), ...options });
  if (!tr) return false;
  const ydoc = ySyncPluginKey.getState(view.state)?.doc;
  const metadata = ydoc?.getMap('daMetadata');
  if (metadata) yUndoPluginKey.getState(view.state)?.undoManager?.addToScope(metadata);
  view.dispatch(tr);
  const transact = (fn) => ydoc.transact(fn, ySyncPluginKey);
  if (metadata) engine.recordHashes(metadata, tr.getMeta(engine.HASHES_META), { transact });
  return true;
}
