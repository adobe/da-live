import { LitElement, html } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { getPreviewOrigin, fetchWysiwygCookie, fetchWysiwygBranch } from '../editor-utils/editor-utils.js';
import { initIms as loadIms, getPostMessageTargetOrigin } from '../../shared/utils.js';
import { hideSelectionToolbar } from '../editor-utils/selection-toolbar.js';
import { MESSAGE_TYPES } from '../utils/quick-edit-messages.js';
import { canvasBus } from '../utils/canvas-bus.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

const QUICK_EDIT_INIT_INTERVAL_MS = 400;
const QUICK_EDIT_INIT_MAX_ATTEMPTS = 25;

const WYSIWYG_PORT_READY_ATTR = 'data-nx-wysiwyg-port-ready';

const VALIDATION_RUN_TIMEOUT_MS = 4000;
const VALIDATION_MAX_ITEMS = 200;
const VALIDATION_MESSAGE_MAX_LENGTH = 500;
const VALIDATION_SEVERITIES = new Set(['info', 'warn', 'error']);
const VALIDATION_MESSAGE_TYPES = { RUN: 'run', RESULT: 'result' };

function isValidValidationItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (!VALIDATION_SEVERITIES.has(item.severity)) return false;
  if (typeof item.message !== 'string' || item.message.length > VALIDATION_MESSAGE_MAX_LENGTH) return false;
  const { blockIndex, proseIndex } = item.item ?? {};
  const hasBlockIndex = Number.isInteger(blockIndex) && blockIndex >= 0;
  const hasProseIndex = Number.isInteger(proseIndex) && proseIndex >= 0;
  return hasBlockIndex !== hasProseIndex;
}

function sanitizeValidationItems(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(isValidValidationItem).slice(0, VALIDATION_MAX_ITEMS);
}

function buildQuickEditInitPayload({ org, repo, path, branch = 'main', canWrite = false }) {
  const pathWithoutOrgRepo = path.split('/').slice(2).join('/');
  const pathname = pathWithoutOrgRepo ? `/${pathWithoutOrgRepo}` : '/';
  return {
    config: {
      mountpoint: `${getPreviewOrigin(org, repo, branch)}/${org}/${repo}`,
      canWrite,
    },
    location: { pathname },
  };
}

async function tryLoadWysiwygPreviewCookies({ org, repo, path, branch, getCurrentCtx }) {
  try {
    const token = (await loadIms())?.accessToken?.token;
    if (!token) {
      // eslint-disable-next-line no-console
      console.warn('[ew-editor-wysiwyg] Preview cookies: no auth token, proceeding without cookies');
    } else {
      await fetchWysiwygCookie({ org, repo, token, branch }).catch((e) => {
        // eslint-disable-next-line no-console
        console.warn('[ew-editor-wysiwyg] Preview cookies failed, proceeding without cookies', e);
      });
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ew-editor-wysiwyg] Preview cookie setup failed, proceeding without cookies', e);
  }
  const cur = getCurrentCtx();
  return cur?.org === org && cur?.repo === repo && cur?.path === path;
}

export class EwEditorWysiwyg extends LitElement {
  static properties = {
    ctx: { type: Object },
    canWrite: { type: Boolean },
    _cookieReady: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._unsubscribeEditorActive = canvasBus.editorViewState.subscribe(({ view }) => {
      this._canvasActiveView = view;
      this._syncCanvasVisibility();
    });
    this._unsubscribeValidationRunRequest = canvasBus.validationRunRequest
      .subscribe(() => this._runValidation());
    this._syncCanvasVisibility();
  }

  disconnectedCallback() {
    this._unsubscribeEditorActive?.();
    this._unsubscribeValidationRunRequest?.();
    this._clearQuickEditRetry();
    this._disposeQuickEditValidationPort();
    super.disconnectedCallback();
  }

  get _iframeSrc() {
    const { org, repo, path } = this.ctx ?? {};
    if (!org || !repo || !path || !this._cookieReady) return null;
    const segments = path.split('/');
    const pathWithoutOrgRepo = segments.slice(2).join('/');
    const encodedPath = pathWithoutOrgRepo.split('/').map(encodeURIComponent).join('/');
    const quickEdit = new URLSearchParams(window.location.search).get('quick-edit') || 'on';
    const base = `${getPreviewOrigin(org, repo, this._wysiwygBranch ?? 'main')}/${encodedPath}?rum=off&consent=disabled&quick-edit=${encodeURIComponent(quickEdit)}`;
    return `${base}&controller=parent`;
  }

  _disposeQuickEditLocalPort() {
    if (!this._quickEditLocalPort) return;
    try {
      this._quickEditLocalPort.onmessage = null;
      this._quickEditLocalPort.close();
    } catch {
      /* ignore */
    }
    this._quickEditLocalPort = null;
  }

  _disposeQuickEditValidationPort() {
    if (this._validationTimeoutId) {
      clearTimeout(this._validationTimeoutId);
      this._validationTimeoutId = null;
    }
    this._pendingValidationRequestId = null;
    if (!this._quickEditValidationPort) return;
    try {
      this._quickEditValidationPort.onmessage = null;
      this._quickEditValidationPort.close();
    } catch {
      /* ignore */
    }
    this._quickEditValidationPort = null;
  }

  _clearQuickEditRetry() {
    if (this._quickEditInitRetryId) {
      clearInterval(this._quickEditInitRetryId);
      this._quickEditInitRetryId = null;
    }
    this._disposeQuickEditLocalPort();
  }

  _syncCanvasVisibility() {
    const view = this._canvasActiveView ?? 'layout';
    const showWysiwyg = view === 'layout' || view === 'split';
    this.hidden = !showWysiwyg;
    hideSelectionToolbar();
  }

  _resetCookieStateForCtxChange() {
    this._clearQuickEditRetry();
    this._cookieReady = false;
  }

  updated(changed) {
    super.updated(changed);
    if (!changed.has('ctx')) return;
    this.removeAttribute(WYSIWYG_PORT_READY_ATTR);
    this._resetCookieStateForCtxChange();
    this._syncCanvasVisibility();
    const { org, repo, path } = this.ctx ?? {};
    if (!org || !repo || !path) return;

    fetchWysiwygBranch({ org, site: repo, path }).then((branch) => {
      this._wysiwygBranch = branch;
      return tryLoadWysiwygPreviewCookies({
        org,
        repo,
        path,
        branch,
        getCurrentCtx: () => this.ctx,
      });
    }).then((ok) => {
      if (!ok) return;
      this._cookieReady = true;
      this.requestUpdate();
    });
  }

  _dispatchWysiwygPortReady(port) {
    this._clearQuickEditRetry();
    this.setAttribute(WYSIWYG_PORT_READY_ATTR, '');
    this._syncCanvasVisibility();
    const iframe = this.shadowRoot?.querySelector('iframe');
    canvasBus.wysiwygPortReady.emit({ port, iframe });
  }

  _scheduleQuickEditInitRetries(send) {
    let attempts = 0;
    this._quickEditInitRetryId = setInterval(() => {
      attempts += 1;
      if (attempts >= QUICK_EDIT_INIT_MAX_ATTEMPTS) {
        this._clearQuickEditRetry();
        return;
      }
      send();
    }, QUICK_EDIT_INIT_INTERVAL_MS);
  }

  _onValidationPortMessage(ev) {
    if (ev.data?.type !== VALIDATION_MESSAGE_TYPES.RESULT) return;
    const { requestId, items } = ev.data;
    if (requestId !== this._pendingValidationRequestId) return;
    clearTimeout(this._validationTimeoutId);
    this._validationTimeoutId = null;
    this._pendingValidationRequestId = null;
    this._validationItems = sanitizeValidationItems(items);
    // eslint-disable-next-line no-console
    console.log('[ew-editor-wysiwyg] validation result (temporary devtools hook)', this._validationItems);
  }

  _runValidation() {
    if (!this._quickEditValidationPort) return;
    if (this._validationTimeoutId) clearTimeout(this._validationTimeoutId);
    const requestId = `val-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this._pendingValidationRequestId = requestId;
    this._quickEditValidationPort.postMessage({ type: VALIDATION_MESSAGE_TYPES.RUN, requestId });
    this._validationTimeoutId = setTimeout(() => {
      if (this._pendingValidationRequestId !== requestId) return;
      this._pendingValidationRequestId = null;
      this._validationItems = null;
      // eslint-disable-next-line no-console
      console.warn('[ew-editor-wysiwyg] validation run timed out', requestId);
    }, VALIDATION_RUN_TIMEOUT_MS);
  }

  _postQuickEditInitToIframe({ iframe, config, location, onReady }) {
    this._disposeQuickEditLocalPort();
    this._disposeQuickEditValidationPort();
    const { port1, port2 } = new MessageChannel();
    const validationChannel = new MessageChannel();
    this._quickEditLocalPort = port1;
    this._quickEditValidationPort = validationChannel.port1;
    this._quickEditValidationPort.onmessage = (ev) => this._onValidationPortMessage(ev);
    port1.onmessage = (ev) => {
      // @deprecated flat `ready` — prefer `type === MESSAGE_TYPES.READY` (da-nx now sends both).
      const isReady = ev.data?.type === MESSAGE_TYPES.READY || ev.data?.ready === true;
      if (!isReady) return;
      this._quickEditLocalPort = null;
      onReady(port1);
    };
    try {
      const targetOrigin = getPostMessageTargetOrigin(iframe.src);
      // @deprecated top-level init/location — prefer type/payload. Kept so the quick-edit
      // iframe script (da-nx) keeps working until it migrates.
      iframe.contentWindow.postMessage({
        init: config,
        location,
        type: MESSAGE_TYPES.INIT,
        payload: { config, location },
      }, targetOrigin, [port2, validationChannel.port2]);
    } catch (err) {
      this._disposeQuickEditLocalPort();
      this._disposeQuickEditValidationPort();
      // eslint-disable-next-line no-console
      console.error('[ew-editor-wysiwyg] Error posting init to iframe', err);
    }
  }

  _onIframeLoad(e) {
    const iframe = e?.target;
    const { org, repo, path } = this.ctx ?? {};
    if (!iframe?.contentWindow || !org || !repo || !path) return;

    this.removeAttribute(WYSIWYG_PORT_READY_ATTR);
    this._clearQuickEditRetry();
    this._syncCanvasVisibility();

    const { config, location } = buildQuickEditInitPayload({
      org,
      repo,
      path,
      branch: this._wysiwygBranch ?? 'main',
      canWrite: this.canWrite === true,
    });
    const send = () => this._postQuickEditInitToIframe({
      iframe,
      config,
      location,
      onReady: (port) => this._dispatchWysiwygPortReady(port),
    });

    send();
    this._scheduleQuickEditInitRetries(send);
  }

  _onIframeBlur() {
    hideSelectionToolbar();
  }

  render() {
    const { org, repo, path } = this.ctx ?? {};
    const hasPath = org && repo && path;
    let body;
    if (!hasPath) {
      body = html`
        <div class="ew-editor-wysiwyg-placeholder">Select an HTML file for WYSIWYG preview.</div>
      `;
    } else if (!this._cookieReady) {
      body = html`<div class="ew-editor-wysiwyg-placeholder">Loading preview…</div>`;
    } else {
      const src = this._iframeSrc;
      body = html`
        <iframe
          title="WYSIWYG preview"
          src="${src}"
          allow="local-network-access"
          class="ew-editor-wysiwyg-iframe"
          @load=${this._onIframeLoad}
          @blur=${this._onIframeBlur}
        ></iframe>
      `;
    }
    return html`
      <div class="ew-editor-wysiwyg-surface">
        ${body}
      </div>
    `;
  }
}

customElements.define('ew-editor-wysiwyg', EwEditorWysiwyg);
