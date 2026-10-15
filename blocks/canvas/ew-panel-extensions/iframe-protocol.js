import { insertText, insertHTML, replaceHTML, getEditorSelection } from './helpers.js';
import { getActiveBlockIndex } from '../editor-utils/blocks.js';
import { getExtensionHTML } from '../editor-utils/editor-utils.js';
import { getNx } from '../../../scripts/utils.js';
import { getPostMessageTargetOrigin, isRequestId, isValidHref, replyToGetSelection } from '../../shared/utils.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { getCanvasBranch } from '../utils/branch.js';

const { CHAT_EVENT } = await import(`${getNx()}/utils/chat.js`);
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
  const publishDocument = () => {
    clearTimeout(htmlTimer);
    htmlTimer = undefined;
    if (!subscribed) return;
    const editorView = getView();
    const selection = selectionFor(editorView);
    lastBlockIndex = selection.blockIndex;
    channel.port1.postMessage({
      action: 'liveDocument',
      html: editorView ? getExtensionHTML(editorView) : '',
      selection,
      editable: !!editorView?.editable,
    });
  };
  const scheduleDocument = () => {
    if (!subscribed) return;
    clearTimeout(htmlTimer);
    htmlTimer = setTimeout(publishDocument, 150);
  };
  const publishSelection = ({ blockIndex }) => {
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
        unsubscribeSelect = canvasBus.editorSelectState.subscribe(publishSelection);
      }
      publishDocument();
      return;
    }
    if (action === 'unsubscribeLiveDocument') {
      stopSubscription();
      return;
    }

    if (action === 'openComparison' || action === 'closeComparison') {
      if (action === 'openComparison'
        && (!['document', 'preview'].includes(details?.candidate) || details?.baseline !== 'live')) return;
      canvasBus.comparisonRequest.emit({
        action,
        details: action === 'openComparison' ? { candidate: details.candidate, baseline: details.baseline } : undefined,
        context: { org, site, path },
      });
      return;
    }
    if (action === 'saveDocument') {
      const { requestId } = e.data;
      if (!isRequestId(requestId)) return;
      canvasBus.comparisonRequest.emit({
        action,
        context: { org, site, path },
        resolve: (result) => channel.port1.postMessage({ action: 'sdkResponse', requestId, result }),
      });
      return;
    }
    const editorView = getView();

    if (action === 'sendHTML' && typeof details === 'object') {
      const { requestId } = e.data;
      if (!isRequestId(requestId)) return;
      let result;
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
          if (getExtensionHTML(editorView) !== expected.html) {
            throw Object.assign(new Error('The live document changed while editing'), { code: 'STALE_LIVE' });
          }
        }
        replaceHTML(editorView, details.html);
        const html = getExtensionHTML(editorView);
        const selection = selectionFor(editorView);
        publishDocument();
        result = { ok: true, html, selection, editable: !!editorView.editable };
      } catch (error) {
        result = { ok: false, error: error.code || 'REPLACE_FAILED', message: error.message };
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
  };

  let token;
  try {
    const { loadIms } = await import(`${getNx()}/utils/ims.js`);
    const ims = await loadIms();
    token = ims?.accessToken?.token;
  } catch { /* proceed without token */ }

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
    stopSubscription();
    clearTimeout(readyTimer);
    document.removeEventListener(CHAT_EVENT.AGENT_CHANGE, onAgentChange);
    channel.port1.close();
    channel.port2.close();
  };

  return { channel, destroy };
}
