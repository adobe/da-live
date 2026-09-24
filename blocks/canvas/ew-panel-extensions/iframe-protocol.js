import { insertText, insertHTML, getEditorSelection } from './helpers.js';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import { getAuthToken, initIms, getPostMessageTargetOrigin, isValidHref } from '../../shared/utils.js';
import { getRepositoryConfig } from './aem-assets.js';
import { createAssetListing } from './asset-list.js';
import { createLocalAssetListing } from './local-asset-list.js';

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
  const localMock = window.location.port === '3000'
    && ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const prepareAsset = async (id) => {
    const token = localMock ? null : await getAuthToken();
    await assetListing.prepareFile(id, token);
  };
  const respondToPicker = (type, details) => {
    if (!destroyed && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type, ...details }, targetOrigin);
    }
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
    }
  };
  window.addEventListener('message', onPluginMessage);

  channel.port1.onmessage = (e) => {
    const { action, details } = e.data || {};
    const editorView = getView();

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
      if (!editorView) {
        channel.port1.postMessage({ action: 'error', details: 'No editor view' });
        return;
      }
      const html = getEditorSelection(editorView);
      if (!html) {
        channel.port1.postMessage({ action: 'error', details: 'No selection found' });
        return;
      }
      iframe.contentWindow.postMessage(
        { action: 'sendSelection', details: html },
        targetOrigin,
      );
    }
  };

  const ref = new URLSearchParams(window.location.search).get('ref') || 'main';
  const project = {
    org,
    repo: site,
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
    iframe.contentWindow.postMessage(
      { ready: true, project, context: project, token },
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
    clearTimeout(readyTimer);
    document.removeEventListener(CHAT_EVENT.AGENT_CHANGE, onAgentChange);
    window.removeEventListener('message', onPluginMessage);
    window.removeEventListener('resize', renderDragHandles);
    window.removeEventListener('scroll', renderDragHandles, true);
    frameObserver.disconnect();
    dragHandleLayer.remove();
    window.dispatchEvent(new Event('ew-table-drag-end'));
    window.dispatchEvent(new Event('ew-asset-drag-end'));
    channel.port1.close();
    channel.port2.close();
  };

  return { channel, destroy };
}
