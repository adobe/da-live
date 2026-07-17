import { insertText, insertHTML, getEditorSelection } from './helpers.js';
import { getNx } from '../../../scripts/utils.js';
import { getIframeOrigin, sendIframeHandshake } from '../../shared/utils.js';

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
  if (!org || !site || !iframe.contentWindow) return { channel: null, destroy() { } };

  const targetOrigin = getIframeOrigin(iframe);
  if (!targetOrigin) return { channel: null, destroy() { } };

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

  const channel = sendIframeHandshake(
    iframe,
    targetOrigin,
    { ready: true, project, context: project, token },
  );
  if (!channel) return { channel: null, destroy() { } };

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

    if (action === 'showPanel') {
      document.dispatchEvent(new CustomEvent('nx-show-panel', { detail: { panelName: details } }));
    }

    if (action === 'setPrompt') {
      const text = typeof details === 'string' ? details : details.text;
      const autoSend = typeof details === 'object' && details.autoSend;
      document.dispatchEvent(new CustomEvent('nx-open-chat-panel', { detail: { text, autoSend } }));
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

  const onAgentChange = ({ detail }) => {
    if (!iframe.contentWindow) return;
    iframe.contentWindow.postMessage({ action: 'agentChange', detail }, targetOrigin);
  };
  document.addEventListener('nx-agent-change', onAgentChange);

  const destroy = () => {
    document.removeEventListener('nx-agent-change', onAgentChange);
    channel.port1.close();
  };

  return { channel, destroy };
}
