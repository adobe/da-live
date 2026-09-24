import { LitElement, html } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { getPreviewOrigin, fetchWysiwygCookie, fetchWysiwygBranch } from '../editor-utils/editor-utils.js';
import { initIms as loadIms } from '../../shared/utils.js';
import { toolbarController } from '../editor-utils/toolbar-controller.js';
import { MESSAGE_TYPES } from '../utils/quick-edit-messages.js';
import { canvasBus } from '../utils/canvas-bus.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

const QUICK_EDIT_INIT_INTERVAL_MS = 400;
const QUICK_EDIT_INIT_MAX_ATTEMPTS = 25;

const WYSIWYG_PORT_READY_ATTR = 'data-nx-wysiwyg-port-ready';

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
    _tableDragging: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this._onTableDragStart = ({ detail }) => {
      if (!this.canWrite || this.hidden || !this.shadowRoot?.querySelector('iframe')) return;
      this._dragHtml = detail.html;
      this._tableDragging = true;
    };
    this._onTableDragEnd = () => this._finishTableDrag();
    window.addEventListener('ew-table-drag-start', this._onTableDragStart);
    window.addEventListener('ew-table-drag-end', this._onTableDragEnd);
    document.addEventListener('drop', this._onTableDragEnd);
    document.addEventListener('dragend', this._onTableDragEnd);
    this.shadowRoot.adoptedStyleSheets = [style];
    this._unsubscribeEditorActive = canvasBus.editorViewState.subscribe(({ view }) => {
      this._canvasActiveView = view;
      this._syncCanvasVisibility();
    });
    this._syncCanvasVisibility();
  }

  disconnectedCallback() {
    window.removeEventListener('ew-table-drag-start', this._onTableDragStart);
    window.removeEventListener('ew-table-drag-end', this._onTableDragEnd);
    document.removeEventListener('drop', this._onTableDragEnd);
    document.removeEventListener('dragend', this._onTableDragEnd);
    this._finishTableDrag();
    this._unsubscribeEditorActive?.();
    this._clearQuickEditRetry();
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
    if (!showWysiwyg) this._finishTableDrag();
  }

  _relayTableDrag(phase, event, markup) {
    const iframe = this.shadowRoot?.querySelector('iframe');
    if (!iframe?.contentWindow) return;
    const rect = iframe.getBoundingClientRect();
    const x = event ? (event.clientX - rect.left) * (iframe.clientWidth / rect.width) : 0;
    const y = event ? (event.clientY - rect.top) * (iframe.clientHeight / rect.height) : 0;
    iframe.contentWindow.postMessage({
      type: 'ew-table-drag-preview',
      phase,
      x,
      y,
      ...(markup ? { html: markup } : {}),
    }, new URL(iframe.src).origin);
  }

  _finishTableDrag() {
    if (this._tableDragging) this._relayTableDrag('leave');
    this._tableDragging = false;
    this._dragHtml = null;
  }

  _onDropSurfaceDragOver(event) {
    if (!this._tableDragging || !this.canWrite || event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    this._relayTableDrag('over', event);
  }

  _onDropSurfaceDrop(event) {
    if (!this._tableDragging || !this.canWrite || event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    this._relayTableDrag('drop', event, event.dataTransfer?.getData('text/html') || this._dragHtml);
    this._finishTableDrag();
  }

  _resetCookieStateForCtxChange() {
    this._finishTableDrag();
    this._clearQuickEditRetry();
    this._cookieReady = false;
  }

  updated(changed) {
    super.updated(changed);
    if (changed.has('canWrite') && !this.canWrite) this._finishTableDrag();
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

  _postQuickEditInitToIframe({ iframe, config, location, onReady }) {
    this._disposeQuickEditLocalPort();
    const { port1, port2 } = new MessageChannel();
    this._quickEditLocalPort = port1;
    port1.onmessage = (ev) => {
      // @deprecated flat `ready` — prefer `type === MESSAGE_TYPES.READY` (da-nx now sends both).
      const isReady = ev.data?.type === MESSAGE_TYPES.READY || ev.data?.ready === true;
      if (!isReady) return;
      this._quickEditLocalPort = null;
      onReady(port1);
    };
    try {
      // @deprecated top-level init/location — prefer type/payload. Kept so the quick-edit
      // iframe script (da-nx) keeps working until it migrates.
      iframe.contentWindow.postMessage({
        init: config,
        location,
        type: MESSAGE_TYPES.INIT,
        payload: { config, location },
      }, '*', [port2]);
    } catch (err) {
      this._disposeQuickEditLocalPort();
      // eslint-disable-next-line no-console
      console.error('[ew-editor-wysiwyg] Error posting init to iframe', err);
    }
  }

  _onIframeLoad(e) {
    const iframe = e?.target;
    const { org, repo, path } = this.ctx ?? {};
    if (!iframe?.contentWindow || !org || !repo || !path) return;

    toolbarController.setIframe(iframe);
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

  _onIframeFocus() {
    const iframe = this.shadowRoot?.querySelector('iframe');
    canvasBus.toolbarSurfaceRequest.emit({ surface: 'wysiwyg', active: true, iframeEl: iframe });
  }

  _onIframeBlur() {
    // Defer so focus can settle. If it landed on the toolbar (button/dialog), keep
    // the wysiwyg surface active; otherwise the user has left the pane.
    setTimeout(() => {
      const tb = toolbarController.ensureToolbar();
      const active = document.activeElement;
      if (active && (active === tb || tb.contains(active))) return;
      canvasBus.toolbarSurfaceRequest.emit({ surface: 'wysiwyg', active: false });
    }, 0);
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
          @focus=${this._onIframeFocus}
          @blur=${this._onIframeBlur}
        ></iframe>
        ${this._tableDragging ? html`<div class="ew-editor-wysiwyg-drop-surface"
          @dragover=${this._onDropSurfaceDragOver}
          @drop=${this._onDropSurfaceDrop}
          @dragleave=${() => this._relayTableDrag('leave')}
        ></div>` : ''}
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
