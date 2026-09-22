import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { reportPreflightStatus } from '../editor-utils/preflight-bridge.js';
import { loadProviderResults } from '../../edit/da-prepare/actions/preflight/providers/provider-registry.js';
import { computeOverallStatus, LOAD_TIMEOUT_MS } from '../../edit/da-prepare/actions/preflight/providers/engine.js';
import { adaptPreflightResults } from './adapter.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);
const baseStyle = await loadStyle(new URL('../../shared/styles/base.css', import.meta.url).href);

const REFRESH_ICON_SRC = '/img/icons/s2-icon-refresh-20-n.svg';
const REFRESH_ICON_HTML = `<svg aria-hidden="true" class="icon" viewBox="0 0 20 20"><use href="${REFRESH_ICON_SRC}#icon"></use></svg>`;
const REFRESH_SPINNER_HTML = '<span class="da-loading-spinner" aria-hidden="true"></span>';

// The renderer lives in da-nx; importing it defines <nx-page-eval> and loads its CSS as a
// side effect. Memoized so repeated runs don't re-import.
let rendererPromise;
function ensureRenderer() {
  rendererPromise ??= import(`${getNx2()}/blocks/chat-ao/artifacts/page-evaluation.js`);
  return rendererPromise;
}

function withHtmlExt(segment) {
  if (!segment || segment.endsWith('/') || /\.(html|json)$/.test(segment)) return segment;
  return `${segment}.html`;
}

// Mirrors da-nx's ew-actions.js buildPrepareDetails() - same fullpath convention the OOTB
// providers fetch the document from (getNx2Api().source.get(fullpath)).
function buildDetails({ org, site, path } = {}) {
  if (!org || !site || !path) return null;
  const pathname = withHtmlExt(path.startsWith('/') ? path : `/${path}`);
  const fullpath = withHtmlExt(`/${org}/${site}${pathname}`);
  return {
    org, site, owner: org, repo: site, path: pathname, fullpath, view: 'edit',
  };
}

class EwPreflight extends LitElement {
  static properties = {
    _loading: { state: true },
    _error: { state: true },
    _data: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [baseStyle, style];
    this._unsubHash = hashChange.subscribe((state) => { this._hashState = state; });
    this._unsubRun = canvasBus.preflightRunRequest.subscribe(this.handleRunRequest);
    if (!this._started) {
      this._started = true;
      this._run();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubHash?.();
    this._unsubRun?.();
  }

  get _details() {
    return buildDetails(this._hashState);
  }

  handleRunRequest = (detail) => {
    const { paths, requestId } = detail || {};
    if (!requestId || requestId === this._lastHandledRequestId) return;
    if (!paths || paths.length !== 1 || paths[0] !== this._details?.fullpath) return;
    this._lastHandledRequestId = requestId;
    this._pendingRequestId = requestId;
    this._run();
  };

  _maybeEmitStatus(categories, details) {
    if (!this._pendingRequestId) return;
    const status = computeOverallStatus(categories);
    if (!status) return;
    reportPreflightStatus({ path: details?.fullpath, status, requestId: this._pendingRequestId });
    this._pendingRequestId = undefined;
  }

  async _run() {
    const details = this._details;
    if (!details) {
      this._error = 'No page is open.';
      return;
    }
    // Guard against a stale response overwriting a newer run.
    const runId = (this._runId ?? 0) + 1;
    this._runId = runId;
    this._loading = true;
    this._error = null;
    this._setRefreshBusy(true);
    try {
      await ensureRenderer();
      const categories = await loadProviderResults({
        details,
        signal: AbortSignal.timeout(LOAD_TIMEOUT_MS),
        onUpdate: () => {
          if (this._runId !== runId) return;
          this._data = adaptPreflightResults(categories);
          this._maybeEmitStatus(categories, details);
        },
      });
      if (this._runId !== runId) return;
      this._data = adaptPreflightResults(categories);
      this._maybeEmitStatus(categories, details);
    } catch {
      if (this._runId !== runId) return;
      this._error = 'Could not run preflight. Try again.';
    } finally {
      if (this._runId === runId) {
        this._loading = false;
        this._setRefreshBusy(false);
      }
    }
  }

  _setRefreshBusy(busy) {
    const btn = this._headerRefreshBtn;
    if (!btn) return;
    btn.disabled = busy;
    btn.innerHTML = busy ? REFRESH_SPINNER_HTML : REFRESH_ICON_HTML;
  }

  _getHeaderRefreshButton() {
    if (this._headerRefreshBtn) return this._headerRefreshBtn;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'da-icon-btn';
    btn.setAttribute('aria-label', 'Refresh preflight');
    btn.disabled = !!this._loading;
    btn.innerHTML = this._loading ? REFRESH_SPINNER_HTML : REFRESH_ICON_HTML;
    btn.addEventListener('click', () => this._run());
    this._headerRefreshBtn = btn;
    return btn;
  }

  // Honored by the tool panel for first-party views (see tool-panel.js).
  getHeaderActions() {
    return this._getHeaderRefreshButton();
  }

  renderBody() {
    if (this._loading && !this._data) {
      return html`
        <div class="ew-preflight-status">
          <span class="da-loading-spinner"></span>
          <span>Running preflight…</span>
        </div>`;
    }
    if (this._error && !this._data) {
      return html`
        <div class="ew-preflight-status" role="alert">
          <p>${this._error}</p>
          <button class="ew-preflight-retry" @click=${() => this._run()}>Try again</button>
        </div>`;
    }
    if (!this._data) return nothing;
    return html`<nx-page-eval .data=${this._data}></nx-page-eval>`;
  }

  render() {
    return html`<div class="ew-preflight-body">${this.renderBody()}</div>`;
  }
}

if (!customElements.get('ew-preflight')) {
  customElements.define('ew-preflight', EwPreflight);
}
