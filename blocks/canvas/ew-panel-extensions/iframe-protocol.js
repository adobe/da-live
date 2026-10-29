import { insertText, insertHTML, replaceHTMLAtCursor, getEditorSelection } from './helpers.js';
import { getActiveBlockIndex } from '../editor-utils/blocks.js';
import { getInstrumentedHTMLForSDK } from '../editor-utils/editor-utils.js';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import {
  getAuthToken, initIms, getPostMessageTargetOrigin, isRequestId, isValidHref, replyToGetSelection,
} from '../../shared/utils.js';
import { getRepositoryConfig } from './aem-assets.js';
import { createAssetListing } from './asset-list.js';
import { createLocalAssetListing } from './local-asset-list.js';
import { getBlockProperties, replaceBlockText, replaceBlockImage } from './properties.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { getCanvasBranch } from '../utils/branch.js';
import { routeComparisonMessage } from '../ew-comparison/comparison.js';

const { CHAT_EVENT } = await import(`${getNx()}/utils/chat.js`);
const { PANEL_EVENT } = await import(`${getNx()}/utils/panel.js`);
const { DA_ADMIN } = await import(`${getNx2()}/utils/utils.js`);

/**
 * Wire a two-way MessageChannel between the host and a BYO plugin iframe.
 * Asset requests use postMessage: ew-asset-list-request { more?: boolean } →
 * ew-asset-list-result { assets: [{ asset, thumbnail, name }], hasMore }
 * or ew-asset-list-error { error }.
 * Authentication and pagination URLs stay in the host, never in the iframe.
 *
 * @param {object} opts
 * @param {HTMLIFrameElement} opts.iframe
 * @param {object} opts.hashState
 * @param {Function} opts.getView
 * @param {Function} opts.onClose
 * @returns {{ channel: MessageChannel, destroy: () => void }}
 */
export async function setupIframeChannel({ iframe, hashState, getView, onClose }) {
  const { org, site, path, view } = hashState;
  if (!org || !site || !iframe.contentWindow) return { channel: null, destroy() { } };

  const targetOrigin = getPostMessageTargetOrigin(iframe.src);

  const channel = new MessageChannel();
  const dragHandleLayer = document.createElement('div');
  dragHandleLayer.className = 'ew-table-drag-handles';
  Object.assign(dragHandleLayer.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '1000',
    pointerEvents: 'none',
  });
  let dragHandles = [];
  let assetConfigPromise;
  let assetListing;
  let loadingAssets = false;
  let destroyed = false;
  let propertiesOpen = false;
  let propertiesScheduled = false;
  const respondToPicker = (type, details) => {
    if (!destroyed && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type, ...details }, targetOrigin);
    }
  };
  const sendProperties = (saved = false) => {
    if (!propertiesOpen || destroyed) return;
    respondToPicker('ew-properties-result', { ...getBlockProperties(getView()), saved });
  };
  const scheduleProperties = () => {
    if (!propertiesOpen || propertiesScheduled) return;
    propertiesScheduled = true;
    queueMicrotask(() => {
      propertiesScheduled = false;
      sendProperties();
    });
  };
  const unsubscribeSelection = canvasBus.editorSelectState.subscribe(scheduleProperties);
  const unsubscribeDocument = canvasBus.editorHtmlState.subscribe(scheduleProperties);
  const localMock = window.location.port === '3000'
    && ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const prepareAsset = async (id) => {
    const token = localMock ? null : await getAuthToken();
    await assetListing.prepareFile(id, token);
  };
  const renderDragHandles = () => {
    if (!dragHandles.length || !iframe.isConnected) {
      dragHandleLayer.remove();
      return;
    }
    const frame = iframe.getBoundingClientRect();
    const elements = dragHandles.map((handle) => {
      const left = Math.max(frame.left, frame.left + handle.x);
      const top = Math.max(frame.top, frame.top + handle.y);
      const right = Math.min(frame.right, frame.left + handle.x + handle.width);
      const bottom = Math.min(frame.bottom, frame.top + handle.y + handle.height);
      if (right <= left || bottom <= top) return null;
      const element = document.createElement('div');
      element.className = 'ew-table-drag-handle';
      element.draggable = true;
      element.setAttribute('aria-hidden', 'true');
      Object.assign(element.style, {
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        width: `${right - left}px`,
        height: `${bottom - top}px`,
        pointerEvents: 'auto',
        cursor: 'grab',
      });
      if (handle.assetId) {
        element.addEventListener('pointerenter', () => {
          element.style.cursor = 'progress';
          prepareAsset(handle.assetId).then(() => {
            if (!destroyed) {
              element.style.cursor = 'grab';
              respondToPicker('ew-asset-drag-ready', {});
            }
          }).catch((error) => {
            if (!destroyed) {
              element.style.cursor = 'grab';
              respondToPicker('ew-asset-drag-error', { error: error.message });
            }
          });
        });
        element.addEventListener('dragstart', (e) => {
          const file = assetListing?.getFile(handle.assetId);
          if (!file) {
            e.preventDefault();
            prepareAsset(handle.assetId).then(() => {
              respondToPicker('ew-asset-drag-ready', {});
            }).catch((error) => {
              respondToPicker('ew-asset-drag-error', { error: error.message });
            });
            respondToPicker('ew-asset-drag-error', { error: 'The image is still loading. Drag it again when ready.' });
            return;
          }
          respondToPicker('ew-asset-drag-ready', {});
          e.dataTransfer.setData('application/x-ew-image', 'image');
          e.dataTransfer.effectAllowed = 'copy';
          window.dispatchEvent(new CustomEvent('ew-asset-drag-start', { detail: { file } }));
        });
        element.addEventListener('dragend', () => {
          window.dispatchEvent(new Event('ew-asset-drag-end'));
        });
      } else {
        element.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/html', handle.html);
          e.dataTransfer.effectAllowed = 'copy';
          window.dispatchEvent(new CustomEvent('ew-table-drag-start', { detail: { html: handle.html } }));
        });
        element.addEventListener('dragend', () => {
          window.dispatchEvent(new Event('ew-table-drag-end'));
        });
      }
      if (handle.clickable !== false) {
        element.addEventListener('click', () => {
          iframe.contentWindow?.postMessage({ type: 'ew-table-drag-handle-click', index: handle.index }, targetOrigin);
        });
      }
      element.addEventListener('wheel', (e) => {
        e.preventDefault();
        iframe.contentWindow?.postMessage({ type: 'ew-table-drag-handle-wheel', deltaY: e.deltaY }, targetOrigin);
      }, { passive: false });
      return element;
    }).filter(Boolean);
    dragHandleLayer.replaceChildren(...elements);
    if (elements.length && !dragHandleLayer.isConnected) document.body.append(dragHandleLayer);
    if (!elements.length) dragHandleLayer.remove();
  };
  const frameObserver = new ResizeObserver(renderDragHandles);
  if (iframe instanceof Element) frameObserver.observe(iframe);
  window.addEventListener('resize', renderDragHandles);
  window.addEventListener('scroll', renderDragHandles, true);
  const onPluginMessage = (event) => {
    if (event.source !== iframe.contentWindow || event.origin !== targetOrigin) return;
    if (event.data?.type === 'ew-table-drag-handles') {
      if (!Array.isArray(event.data.handles)) return;
      dragHandles = event.data.handles.map((handle, index) => (
        handle && typeof handle === 'object' ? { ...handle, index } : null
      )).filter((handle) => (
        handle && typeof handle === 'object'
        && [handle.x, handle.y, handle.width, handle.height].every(Number.isFinite)
        && handle.width > 0 && handle.height > 0
        && ((typeof handle.html === 'string' && handle.html.trim())
          || (typeof handle.assetId === 'string' && handle.assetId.trim()
            && handle.clickable === false))
      ));
      renderDragHandles();
    } else if (event.data?.type === 'ew-table-drag-start') {
      const { html } = event.data;
      if (typeof html !== 'string' || !html.trim()) return;
      window.dispatchEvent(new CustomEvent('ew-table-drag-start', { detail: { html } }));
    } else if (event.data?.type === 'ew-table-drag-end') {
      window.dispatchEvent(new Event('ew-table-drag-end'));
    } else if (event.data?.type === 'ew-asset-list-request') {
      if (loadingAssets) return;
      loadingAssets = true;
      (async () => {
        if (localMock) {
          assetListing ??= createLocalAssetListing();
          respondToPicker('ew-asset-list-result', await assetListing.load({ more: event.data.more === true }));
          return;
        }
        const currentToken = await getAuthToken();
        if (!currentToken) throw new Error('Sign in to Experience Workspace to browse assets.');
        assetConfigPromise ??= getRepositoryConfig(org, site).catch((error) => {
          assetConfigPromise = null;
          throw error;
        });
        const config = await assetConfigPromise;
        if (!config) throw new Error('No AEM Assets repository is configured for this site.');
        assetListing ??= createAssetListing(config);
        const result = await assetListing.load({
          more: event.data.more === true,
          token: currentToken,
        });
        respondToPicker('ew-asset-list-result', result);
      })().catch((error) => {
        respondToPicker('ew-asset-list-error', { error: error.message });
      }).finally(() => {
        loadingAssets = false;
      });
    } else if (event.data?.type === 'ew-properties-watch') {
      propertiesOpen = event.data.active === true;
      sendProperties();
    } else if (event.data?.type === 'ew-properties-text') {
      try {
        replaceBlockText(getView(), event.data.item, event.data.text);
        sendProperties(true);
      } catch (error) {
        respondToPicker('ew-properties-error', { error: error.message });
      }
    } else if (event.data?.type === 'ew-properties-image') {
      replaceBlockImage(getView(), event.data.item, event.data.file, { org, site, path })
        .then(() => sendProperties(true))
        .catch((error) => respondToPicker('ew-properties-error', { error: error.message }));
    }
  };
  window.addEventListener('message', onPluginMessage);
  let subscribed = false;
  let htmlTimer;
  let unsubscribeDoc;
  let unsubscribeHtml;
  let unsubscribeSelect;
  let lastBlockIndex = null;

  const selectionFor = (editorView) => {
    const index = getActiveBlockIndex(editorView);
    return { blockIndex: index < 0 ? null : index };
  };
  const broadcastDocument = (snapshot) => {
    clearTimeout(htmlTimer);
    htmlTimer = undefined;
    if (!subscribed) return;
    let documentState = snapshot;
    if (!documentState) {
      const editorView = getView();
      documentState = {
        html: editorView ? getInstrumentedHTMLForSDK(editorView) : '',
        selection: selectionFor(editorView),
        editable: !!editorView?.editable,
      };
    }
    lastBlockIndex = documentState.selection.blockIndex;
    channel.port1.postMessage({
      action: 'liveDocument',
      ...documentState,
    });
  };
  const scheduleDocument = () => {
    if (!subscribed) return;
    clearTimeout(htmlTimer);
    htmlTimer = setTimeout(broadcastDocument, 150);
  };
  const broadcastSelection = ({ blockIndex }) => {
    if (!subscribed || htmlTimer !== undefined) return;
    const index = Number.isInteger(blockIndex) && blockIndex >= 0 ? blockIndex : null;
    if (lastBlockIndex === index) return;
    lastBlockIndex = index;
    channel.port1.postMessage({ action: 'liveSelection', selection: { blockIndex: index } });
  };
  const stopSubscription = () => {
    subscribed = false;
    clearTimeout(htmlTimer);
    htmlTimer = undefined;
    unsubscribeDoc?.();
    unsubscribeHtml?.();
    unsubscribeSelect?.();
    unsubscribeDoc = undefined;
    unsubscribeHtml = undefined;
    unsubscribeSelect = undefined;
  };

  channel.port1.onmessage = (e) => {
    const { action, details } = e.data || {};
    if (action === 'subscribeLiveDocument') {
      if (!subscribed) {
        subscribed = true;
        unsubscribeDoc = canvasBus.editorDocState.subscribe(scheduleDocument);
        unsubscribeHtml = canvasBus.editorHtmlState.subscribe(scheduleDocument);
        unsubscribeSelect = canvasBus.editorSelectState.subscribe(broadcastSelection);
      }
      broadcastDocument();
      return;
    }
    if (action === 'unsubscribeLiveDocument') {
      stopSubscription();
      return;
    }

    const port = channel.port1;
    if (routeComparisonMessage(e.data || {}, { context: { org, site, path }, port })) return;
    const editorView = getView();

    if (action === 'sendHTML' && typeof details === 'object') {
      const { requestId } = e.data;
      if (!isRequestId(requestId)) return;
      try {
        if (!editorView) throw Object.assign(new Error('No editor view'), { code: 'NO_EDITOR' });
        if (details?.replace !== true) throw Object.assign(new Error('Invalid replacement request'), { code: 'INVALID_HTML' });
        if (details.expected !== undefined) {
          const { expected } = details;
          if (typeof expected?.html !== 'string' || !Number.isSafeInteger(expected.blockIndex) || expected.blockIndex < 0) {
            throw Object.assign(new Error('Invalid replacement precondition'), { code: 'INVALID_EXPECTED' });
          }
          if (getActiveBlockIndex(editorView) !== expected.blockIndex) {
            throw Object.assign(new Error('The selected block changed'), { code: 'WRONG_SELECTION' });
          }
          if (getInstrumentedHTMLForSDK(editorView) !== expected.html) {
            throw Object.assign(new Error('The live document changed while editing'), { code: 'STALE_LIVE' });
          }
        }
        replaceHTMLAtCursor(editorView, details.html);
      } catch (error) {
        channel.port1.postMessage({
          action: 'sdkResponse',
          requestId,
          result: { ok: false, error: error.code || 'REPLACE_FAILED', message: error.message },
        });
        return;
      }
      const result = { ok: true, html: null };
      try {
        result.selection = selectionFor(editorView);
        result.editable = !!editorView.editable;
        result.html = getInstrumentedHTMLForSDK(editorView);
        broadcastDocument({
          html: result.html,
          selection: result.selection,
          editable: result.editable,
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Could not serialize or broadcast the live document after replacement:', error);
      }
      channel.port1.postMessage({ action: 'sdkResponse', requestId, result });
      return;
    }

    if (action === 'sendText' && editorView) {
      insertText(editorView, details);
    }

    if (action === 'sendHTML' && editorView) {
      insertHTML(editorView, details);
    }

    if (action === 'setHash') {
      window.location.hash = details;
    }

    if (action === 'setHref' && isValidHref(details)) {
      window.location.href = details;
    }

    if (action === 'closeLibrary') {
      onClose();
    }

    if (action === 'showPanel') {
      document.dispatchEvent(
        new CustomEvent(PANEL_EVENT.OPEN, { detail: { section: 'tools', id: details } }),
      );
    }

    if (action === 'setPrompt') {
      const text = typeof details === 'string' ? details : details.text;
      const autoSend = typeof details === 'object' && details.autoSend;
      document.dispatchEvent(
        new CustomEvent(PANEL_EVENT.OPEN, { detail: { section: 'chat', options: { text, autoSend } } }),
      );
    }

    if (action === 'getSelection') {
      replyToGetSelection({
        port: channel.port1,
        target: iframe.contentWindow,
        targetOrigin,
        requestId: e.data.requestId,
        html: editorView ? getEditorSelection(editorView) : null,
        error: editorView ? 'No selection found' : 'No editor view',
      });
    }
  };

  const ref = new URLSearchParams(window.location.search).get('ref') || 'main';
  const project = {
    org,
    repo: site,
    site,
    ref,
    path: path ? `/${path}` : '/',
    view: view || 'edit',
    hash: window.location.hash,
    daAdmin: DA_ADMIN,
    editorOrigin: window.location.origin,
  };

  await initIms();
  const token = await getAuthToken();

  const readyTimer = setTimeout(() => {
    if (!iframe.contentWindow) return;
    // Keep ref's plugin-development meaning; branch is the selected site code.
    const context = { ...project, branch: getCanvasBranch({ org, site }) };
    iframe.contentWindow.postMessage(
      {
        ready: true,
        project: context,
        context,
        token,
        capabilities: { liveDocument: 1, sendHTMLReplace: 1 },
      },
      targetOrigin,
      [channel.port2],
    );
  }, 750);

  const onAgentChange = ({ detail }) => {
    if (!iframe.contentWindow) return;
    iframe.contentWindow.postMessage({ action: 'agentChange', detail }, targetOrigin);
  };
  document.addEventListener(CHAT_EVENT.AGENT_CHANGE, onAgentChange);

  const destroy = () => {
    destroyed = true;
    stopSubscription();
    clearTimeout(readyTimer);
    document.removeEventListener(CHAT_EVENT.AGENT_CHANGE, onAgentChange);
    window.removeEventListener('message', onPluginMessage);
    window.removeEventListener('resize', renderDragHandles);
    window.removeEventListener('scroll', renderDragHandles, true);
    frameObserver.disconnect();
    unsubscribeSelection();
    unsubscribeDocument();
    dragHandleLayer.remove();
    window.dispatchEvent(new Event('ew-table-drag-end'));
    window.dispatchEvent(new Event('ew-asset-drag-end'));
    channel.port1.close();
    channel.port2.close();
  };

  return { channel, destroy };
}
