import { NodeSelection } from 'da-y-wrapper';
import { fetchDaConfigs } from '../../shared/utils.js';
import {
  applyEditorChanges, describeEditorBlock, editorError, getEditorSnapshot,
  resolveEditorTarget, selectEditorTarget,
} from '../editor-utils/editor-sdk.js';
import { getExtensionsBridge } from '../editor-utils/extensions-bridge.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { getNx2Api } from '../../../scripts/utils.js';
import { getSourceUploadContext } from '../ew-editor-doc/prose-plugins/sourceUploadContext.js';
import { SUPPORTED_IMAGE_FILES } from '../ew-editor-doc/prose-plugins/imageDrop.js';
import { refuseOversizedImage } from '../utils/image-upload.js';

function unavailableSnapshot() {
  return {
    available: false,
    documentId: null,
    revision: 0,
    html: '',
    editable: false,
    blocks: [],
    selectedBlock: null,
  };
}

export function createEditorProtocol({ port, getView, hashState }) {
  const subscriptions = new Set();
  const dialogs = new Set();
  let disposed = false;
  const snapshot = () => (getView() ? getEditorSnapshot(getView()) : unavailableSnapshot());
  const publish = () => {
    if (disposed || !subscriptions.size) return;
    const details = snapshot();
    subscriptions.forEach((subscriptionId) => port.postMessage({ action: 'editorSnapshot', subscriptionId, details }));
  };
  const unsubscribe = canvasBus.extensionEditorState.subscribe(({ view, closedView }) => {
    if (view === getView() || closedView === getView()) {
      if (closedView) {
        subscriptions.forEach((subscriptionId) => port.postMessage({ action: 'editorSnapshot', subscriptionId, details: unavailableSnapshot() }));
      } else publish();
    }
  });

  const acknowledgement = (view) => {
    const { documentId, revision } = getEditorSnapshot(view);
    return { documentId, revision };
  };

  async function upload(view, request) {
    const entry = resolveEditorTarget(view, request);
    if (entry.type !== 'image') throw editorError('INVALID_TARGET', 'An image target is required.');
    const { file } = request;
    if (!(file instanceof File) || !SUPPORTED_IMAGE_FILES.includes(file.type)) {
      throw editorError('INVALID_CHANGE', 'Select an SVG, PNG, JPEG, or GIF image.');
    }
    const details = getSourceUploadContext(getExtensionsBridge().sourceUrl);
    if (!details) throw editorError('UNAVAILABLE', 'The document upload source is unavailable.');
    if (await refuseOversizedImage(file.size, details.parent)) {
      throw editorError('INVALID_CHANGE', 'The image exceeds the configured upload limit.');
    }
    const { source } = await getNx2Api();
    const response = await source.uploadMedia(`${details.parent}/.${details.name}/${file.name}`, { body: file });
    if (!response.ok) throw editorError('UPLOAD_FAILED', `Image upload failed (${response.status}).`);
    const { source: { contentUrl } = {} } = await response.json();
    if (!contentUrl) throw editorError('UPLOAD_FAILED', 'The upload did not return an image URL.');
    resolveEditorTarget(view, request);
    if (disposed || view !== getView()) {
      throw editorError('UNAVAILABLE', 'The editor connection changed during upload.');
    }
    const attrs = { ...entry.node.attrs, src: contentUrl };
    view.dispatch(view.state.tr.setNodeMarkup(entry.pos, null, attrs));
    return acknowledgement(view);
  }

  function openAssets(view, request) {
    const entry = resolveEditorTarget(view, request);
    if (entry.type !== 'image') throw editorError('INVALID_TARGET', 'An image target is required.');
    return new Promise((resolve, reject) => {
      const dialog = document.createElement('dialog');
      dialog.className = 'sdk-assets-dialog';
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = 'Close';
      const container = document.createElement('div');
      container.style.cssText = 'width: min(90vw, 1100px); height: 75vh;';
      dialog.append(close, container);
      document.body.append(dialog);
      let committed = false;
      let cancel;
      const clean = () => {
        dialogs.delete(cancel);
        dialog.remove();
      };
      const fail = (err) => {
        clean();
        reject(err);
      };
      cancel = () => fail(editorError('UNAVAILABLE', 'The editor connection closed.'));
      dialogs.add(cancel);
      const guard = () => {
        try {
          if (disposed || view !== getView()) throw editorError('UNAVAILABLE', 'The editor connection changed.');
          resolveEditorTarget(view, request);
        } catch (err) { fail(err); throw err; }
      };
      const closeDialog = () => {
        dialog.close();
        queueMicrotask(() => {
          clean();
          resolve(committed ? acknowledgement(view) : { cancelled: true });
        });
      };
      close.addEventListener('click', closeDialog);
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        closeDialog();
      });
      const proxy = {
        get state() {
          guard();
          const { state } = view;
          return {
            doc: state.doc,
            schema: state.schema,
            selection: NodeSelection.create(state.doc, entry.pos),
            get tr() { return state.tr.setSelection(NodeSelection.create(state.doc, entry.pos)); },
          };
        },
        dispatch(tr) {
          guard();
          tr.setSelection(view.state.selection.map(tr.doc, tr.mapping));
          view.dispatch(tr);
          committed = true;
        },
      };
      dialog.showModal();
      import('./aem-assets.js').then(({ renderAssets }) => renderAssets({
        container,
        org: hashState.org,
        site: hashState.site,
        getView: () => { guard(); return proxy; },
        onClose: closeDialog,
        onError: fail,
      })).catch(fail);
    });
  }

  async function openLibrary(view, request) {
    const entry = resolveEditorTarget(view, request);
    if (entry.type !== 'block') throw editorError('INVALID_TARGET', 'A block target is required.');
    const { openBlockLibraryModal } = await import('../ew-block-library-modal/ew-block-library-modal.js');
    return new Promise((resolve, reject) => {
      let inserted = false;
      const cancel = () => reject(editorError('UNAVAILABLE', 'The editor connection closed.'));
      dialogs.add(cancel);
      openBlockLibraryModal({
        heading: 'Replace block',
        onInsert: (dom) => {
          try {
            if (disposed || view !== getView()) throw editorError('UNAVAILABLE', 'The editor connection changed.');
            const result = applyEditorChanges(view, { ...request, changes: [{ type: 'replaceBlock', target: request.target, html: dom.outerHTML }] });
            inserted = true;
            dialogs.delete(cancel);
            resolve(result);
          } catch (err) { dialogs.delete(cancel); reject(err); }
        },
        onClose: () => {
          dialogs.delete(cancel);
          if (!inserted) resolve({ cancelled: true });
        },
      }).then((modal) => {
        if (!modal) {
          dialogs.delete(cancel);
          reject(editorError('UNAVAILABLE', 'The block library is unavailable or already open.'));
        }
      }).catch((err) => { dialogs.delete(cancel); reject(err); });
    });
  }

  return {
    async handle({ action, details = {}, requestId }) {
      if (!requestId) return false;
      try {
        if (disposed) throw editorError('UNAVAILABLE', 'The editor connection is closed.');
        let result;
        const view = getView();
        if (action === 'subscribeDocument') {
          if (typeof details.subscriptionId !== 'string' || subscriptions.size >= 16) {
            throw editorError('INVALID_CHANGE', 'Invalid snapshot subscription.');
          }
          subscriptions.add(details.subscriptionId);
          publish();
          result = {};
        } else if (action === 'unsubscribeDocument') {
          subscriptions.delete(details.subscriptionId);
          result = {};
        } else if (action === 'describeBlock') result = describeEditorBlock(view, details);
        else if (action === 'applyChanges') result = applyEditorChanges(view, details);
        else if (action === 'selectTarget') result = selectEditorTarget(view, details);
        else if (action === 'uploadImage') result = await upload(view, details);
        else if (action === 'pickAsset') result = await openAssets(view, details);
        else if (action === 'openBlockLibrary') result = await openLibrary(view, details);
        else if (action === 'getEditorConfig') {
          const { getRepositoryConfig } = await import('./aem-assets.js');
          const [repository, configs] = await Promise.all([
            getRepositoryConfig(hashState.org, hashState.site),
            Promise.all(fetchDaConfigs(hashState)),
          ]);
          result = { hasAemAssets: !!repository, configs };
        } else throw editorError('UNSUPPORTED', `Unsupported editor action: ${action}`);
        if (!disposed) port.postMessage({ action: 'editorResponse', requestId, details: result });
      } catch (err) {
        // eslint-disable-next-line no-console
        if (!err.code) console.error('Extension editor request failed:', err);
        if (!disposed) {
          port.postMessage({
            action: 'editorResponse',
            requestId,
            error: { code: err.code || 'INVALID_CHANGE', message: err.message },
          });
        }
      }
      return true;
    },
    destroy() {
      if (disposed) return;
      port.postMessage({ action: 'editorClosed' });
      disposed = true;
      unsubscribe();
      subscriptions.clear();
      dialogs.forEach((cancel) => cancel());
      dialogs.clear();
    },
  };
}
