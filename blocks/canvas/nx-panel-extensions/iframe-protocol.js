import { insertText, insertHTML, getEditorSelection } from './helpers.js';
import { getNx } from '../../shared/nxutils.js';

/**
 * Wire a two-way MessageChannel between the host and a BYO plugin iframe.
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
  if (!org || !site || !iframe.contentWindow) return { channel: null, destroy() {} };

  const channel = new MessageChannel();

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

    if (action === 'setHref') {
      window.location.href = details;
    }

    if (action === 'closeLibrary') {
      onClose();
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
        '*',
      );
    }
  };

  const project = {
    org,
    repo: site,
    ref: 'main',
    path: path ? `/${path}` : '/',
    view: view || 'edit',
  };

  let token;
  try {
    const { loadIms } = await import(`${getNx()}/utils/ims.js`);
    const ims = await loadIms();
    token = ims?.accessToken?.token;
  } catch { /* proceed without token */ }

  setTimeout(() => {
    if (!iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      { ready: true, project, context: project, token },
      '*',
      [channel.port2],
    );
  }, 750);

  const destroy = () => {
    channel.port1.close();
  };

  return { channel, destroy };
}
