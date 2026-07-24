import { insertText, insertHTML, getEditorSelection } from './helpers.js';
import { getNx } from '../../../scripts/utils.js';
import { getPostMessageTargetOrigin, isValidHref } from '../../shared/utils.js';

const { CHAT_EVENT } = await import(`${getNx()}/blocks/chat/constants.js`);
const { PANEL_EVENT } = await import(`${getNx()}/utils/panel.js`);

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

  const targetOrigin = getPostMessageTargetOrigin(iframe.src);

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
    document.removeEventListener(CHAT_EVENT.AGENT_CHANGE, onAgentChange);
    channel.port1.close();
  };

  return { channel, destroy };
}
