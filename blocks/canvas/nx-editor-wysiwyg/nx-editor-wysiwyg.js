import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../shared/nxutils.js';
import { getPreviewOrigin, fetchWysiwygCookie } from '../editor-utils/preview.js';
import { initIms as loadIms } from '../../shared/utils.js';
import { hideSelectionToolbar } from '../editor-utils/selection-toolbar.js';

const style = await loadStyle(import.meta.url);

const QUICK_EDIT_INIT_INTERVAL_MS = 400;
const QUICK_EDIT_INIT_MAX_ATTEMPTS = 25;

const WYSIWYG_PORT_READY_ATTR = 'data-nx-wysiwyg-port-ready';

function buildQuickEditInitPayload({ org, repo, path }) {
  const pathWithoutOrgRepo = path.split('/').slice(2).join('/');
  const pathname = pathWithoutOrgRepo ? `/${pathWithoutOrgRepo}` : '/';
  return {
    config: {
      mountpoint: `${getPreviewOrigin(org, repo)}/${org}/${repo}`,
    },
    location: { pathname },
  };
}

async function tryLoadWysiwygPreviewCookies({ org, repo, path, getCurrentCtx }) {
  try {
    const token = (await loadIms())?.accessToken?.token;
    if (!token) {
      // eslint-disable-next-line no-console
      console.warn('[nx-editor-wysiwyg] Preview cookies: no auth token, proceeding without cookies');
    } else {
      await fetchWysiwygCookie({ org, repo, token }).catch((e) => {
        // eslint-disable-next-line no-console
        console.warn('[nx-editor-wysiwyg] Preview cookies failed, proceeding without cookies', e);
      });
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[nx-editor-wysiwyg] Preview cookie setup failed, proceeding without cookies', e);
  }
  const cur = getCurrentCtx();
  return cur?.org === org && cur?.repo === repo && cur?.path === path;
}

export class NxEditorWysiwyg extends LitElement {
  static properties = {
    ctx: { type: Object },
    _cookieReady: { state: true },
    _loading: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._onCanvasEditorActive = (e) => {
      this._canvasActiveView = e.detail?.view;
      this._syncCanvasVisibility();
    };
    this.parentElement?.addEventListener('nx-canvas-editor-active', this._onCanvasEditorActive);
    this._syncCanvasVisibility();
  }

  disconnectedCallback() {
    this.parentElement?.removeEventListener('nx-canvas-editor-active', this._onCanvasEditorActive);
    this._clearQuickEditRetry();
    super.disconnectedCallback();
  }

  get _iframeSrc() {
    const { org, repo, path } = this.ctx ?? {};
    if (!org || !repo || !path || !this._cookieReady) return null;
    const segments = path.split('/');
    const pathWithoutOrgRepo = segments.slice(2).join('/');
    const encodedPath = pathWithoutOrgRepo.split('/').map(encodeURIComponent).join('/');
    const quickEdit = new URLSearchParams(window.location.search).get('quick-edit') || 'ew';
    const base = `${getPreviewOrigin(org, repo)}/${encodedPath}?nx=ew&quick-edit=${encodeURIComponent(quickEdit)}`;
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

  _clearQuickEditRetry() {
    if (this._quickEditInitRetryId) {
      clearInterval(this._quickEditInitRetryId);
      this._quickEditInitRetryId = null;
    }
    this._disposeQuickEditLocalPort();
  }

  _syncCanvasVisibility() {
    const view = this._canvasActiveView ?? 'layout';
    const portReady = this.hasAttribute(WYSIWYG_PORT_READY_ATTR);
    const showWysiwyg = view === 'layout' || view === 'split';
    this.hidden = !showWysiwyg;
    this._loading = showWysiwyg && !portReady;
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

    tryLoadWysiwygPreviewCookies({
      org,
      repo,
      path,
      getCurrentCtx: () => this.ctx,
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
    this.dispatchEvent(new CustomEvent('nx-wysiwyg-port-ready', {
      bubbles: true,
      composed: true,
      detail: { port, iframe },
    }));
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

  _postQuickEditInitToIframe({ iframe, config, location, onReady }) {
    this._disposeQuickEditLocalPort();
    const { port1, port2 } = new MessageChannel();
    this._quickEditLocalPort = port1;
    port1.onmessage = (ev) => {
      if (ev.data?.ready !== true) return;
      this._quickEditLocalPort = null;
      onReady(port1);
    };
    try {
      const targetOrigin = new URL(iframe.src).origin;
      iframe.contentWindow.postMessage({ init: config, location }, targetOrigin, [port2]);
    } catch (err) {
      this._disposeQuickEditLocalPort();
      // eslint-disable-next-line no-console
      console.error('[nx-editor-wysiwyg] Error posting init to iframe', err);
    }
  }

  _onIframeLoad(e) {
    const iframe = e?.target;
    const { org, repo, path } = this.ctx ?? {};
    if (!iframe?.contentWindow || !org || !repo || !path) return;

    this.removeAttribute(WYSIWYG_PORT_READY_ATTR);
    this._clearQuickEditRetry();
    this._syncCanvasVisibility();

    const { config, location } = buildQuickEditInitPayload({ org, repo, path });
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
        <div class="nx-editor-wysiwyg-placeholder">Select an HTML file for WYSIWYG preview.</div>
      `;
    } else if (!this._cookieReady) {
      body = html`<div class="nx-editor-wysiwyg-placeholder">Loading preview…</div>`;
    } else {
      const src = this._iframeSrc;
      body = html`
        <iframe
          title="WYSIWYG preview"
          src="${src}"
          allow="local-network-access"
          class="nx-editor-wysiwyg-iframe"
          @load=${this._onIframeLoad}
          @blur=${this._onIframeBlur}
        ></iframe>
      `;
    }
    return html`
      <div class="nx-editor-wysiwyg-surface" ?hidden=${this._loading}>
        ${body}
      </div>
    `;
  }
}

customElements.define('nx-editor-wysiwyg', NxEditorWysiwyg);
