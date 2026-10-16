import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import { getPreviewOrigin } from '../editor-utils/editor-utils.js';
import { whenCanvasBranch } from '../utils/branch.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { reportPreflightStatus } from '../editor-utils/preflight-bridge.js';
import { takePendingPreflightRequest } from '../editor-utils/preflight-responder.js';
import { adaptEvaluation } from './adapter.js';
import { evaluatePage } from './api.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);
const baseStyle = await loadStyle(new URL('../../shared/styles/base.css', import.meta.url).href);

const VIEW_ID = 'preflight';

function pageKey({ org, site, path } = {}) {
  return org && site ? `${org}/${site}/${(path ?? '').replace(/^\//, '')}` : '';
}

const REFRESH_ICON_SRC = '/img/icons/s2-icon-refresh-20-n.svg';
const REFRESH_ICON_HTML = `<svg aria-hidden="true" class="icon" viewBox="0 0 20 20"><use href="${REFRESH_ICON_SRC}#icon"></use></svg>`;
const REFRESH_SPINNER_HTML = '<span class="da-loading-spinner" aria-hidden="true"></span>';

// The renderer lives in da-nx; importing it defines <nx-page-eval> and loads its
// CSS as a side effect. Memoized so repeated evaluations don't re-import.
let rendererPromise;
function ensureRenderer() {
  rendererPromise ??= import(`${getNx2()}/blocks/chat-ao/artifacts/page-evaluation.js`);
  return rendererPromise;
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
    this._unsubHash = hashChange.subscribe((state) => {
      this._hashState = state;
      if (this._started && pageKey(state) !== this._evaluatedKey) this._onPageChange();
    });
    // Answer a publish gate that runs while the panel is already mounted.
    this._unsubRun = canvasBus.preflightRunRequest.subscribe(this._handlePreflightRun);
    if (!this._started) {
      this._started = true;
      // If a publish opened this panel, run for that gate; otherwise a plain first-open
      // evaluation. Page navigation re-runs via _onPageChange.
      const pending = takePendingPreflightRequest();
      if (pending) this._handlePreflightRun(pending);
      else this._evaluateAndReport();
    }
    // After the first-open run: the channel replays the current view immediately, which
    // must find that run already loading rather than start a second one.
    this._unsubView = canvasBus.toolPanelViewState.subscribe(this._onViewState);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubHash?.();
    this._unsubRun?.();
    this._unsubView?.();
    // Unmounting before a gate settles frees the waiting publish immediately.
    this._cancelGate();
  }

  async _resolvePageUrl() {
    const { org, site, path } = this._hashState ?? {};
    if (!org || !site) return '';
    const relPath = path ? path.replace(/^\//, '') : '';
    // The panel can evaluate before canvas finishes resolving this page's branch.
    const branch = await whenCanvasBranch({ org, site, path: relPath || undefined });
    if (!branch) {
      const error = new Error('Branch not resolved');
      error.detail = 'Could not determine the preview branch for this page. Try again.';
      throw error;
    }
    const origin = getPreviewOrigin(org, site, branch);
    return relPath ? `${origin}/${relPath}` : origin;
  }

  // The document path the publish gate matches STATUS against. Mirrors da-nx's
  // buildPrepareDetails().fullpath (`/org/site/path.html`) so a non-gate refresh
  // updates the gate's Publish dot. Gate runs must match this document path.
  get _docFullpath() {
    const { org, site, path } = this._hashState ?? {};
    if (!org || !site || !path) return '';
    const docPath = path.startsWith('/') ? path : `/${path}`;
    const pathname = docPath.endsWith('/') || /\.(html|json)$/.test(docPath) ? docPath : `${docPath}.html`;
    return `/${org}/${site}${pathname}`;
  }

  // `error` means the checks could not run (API/network failure), as opposed to `fail`
  // (checks ran and found issues); `message` carries the cause for the publish dialog.
  _verdictFor({ data, error } = {}) {
    if (error) return { status: 'error', message: error };
    return { status: data?.failed === 0 ? 'success' : 'fail' };
  }

  // Records which page the results belong to, so navigation can tell they are stale.
  _evaluateCurrentPage() {
    this._evaluatedKey = pageKey(this._hashState);
    return this._evaluate();
  }

  // The results belong to the previous document: drop them, free a gate waiting on the
  // old path, and evaluate the new page once the view is shown.
  _onPageChange() {
    if (this._gateRequestId && this._gatePath !== this._docFullpath) this._cancelGate();
    this._evaluatedKey = pageKey(this._hashState);
    this._runId = (this._runId ?? 0) + 1;
    this._data = null;
    this._error = null;
    this._loading = false;
    this._setRefreshBusy(false);
    this._evaluateIfShown();
  }

  _onViewState = (viewId) => {
    this._activeView = viewId;
    this._evaluateIfShown();
  };

  // No results, no error and nothing in flight means the current page was never evaluated.
  _evaluateIfShown() {
    if (this._activeView !== VIEW_ID) return;
    if (this._data || this._error || this._loading) return;
    this._evaluateAndReport();
  }

  // Run the checks and, outside a gate, report the verdict so the Publish dot tracks it.
  async _evaluateAndReport() {
    const verdict = await this._evaluateCurrentPage();
    if (!verdict || this._gateRequestId) return;
    reportPreflightStatus({ path: this._docFullpath, ...verdict });
  }

  _handlePreflightRun = async (detail) => {
    const requestId = detail?.requestId;
    const path = detail?.path ?? detail?.paths?.[0];
    if (!requestId || !path) return;
    takePendingPreflightRequest(requestId);
    // The pending store (first open) and the live subscription (re-publish) can both
    // deliver the same run; only act once.
    if (requestId === this._lastGateRequestId) return;
    this._lastGateRequestId = requestId;
    if (path !== this._docFullpath) {
      reportPreflightStatus({ path, status: 'cancelled', requestId });
      return;
    }
    // A newer run for this page supersedes the open gate; free that publish first.
    if (this._gateRequestId) this._cancelGate();
    this._started = true;
    this._gateRequestId = requestId;
    this._gatePath = path;
    this._gateSettled = false;
    // Cancel only when the tools panel itself closes (`null`). Other panels closing
    // (e.g. chat) or switching to another tool view leave the run going.
    this._unsubPanelVisibility?.();
    this._unsubPanelVisibility = canvasBus.toolPanelViewState.subscribe((viewId) => {
      if (viewId === null) this._cancelGate();
    });
    const verdict = await this._evaluateCurrentPage();
    // Settle only the gate this run started; it may already be settled or replaced.
    if (this._gateRequestId !== requestId) return;
    if (verdict) this._finishGate(verdict.status, verdict.message);
    else this._cancelGate();
  };

  _finishGate(status, message) {
    if (this._gateSettled || !this._gateRequestId) return;
    this._gateSettled = true;
    this._unsubPanelVisibility?.();
    this._unsubPanelVisibility = null;
    const { _gateRequestId: requestId, _gatePath: path } = this;
    this._gateRequestId = null;
    this._gatePath = null;
    reportPreflightStatus({ path, status, requestId, ...(message && { message }) });
  }

  _cancelGate() {
    this._finishGate('cancelled');
  }

  // Resolves to this run's verdict, or `null` when a newer run superseded it, so
  // callers never read results that belong to another run.
  async _evaluate() {
    // Guard against a stale response overwriting a newer run.
    const runId = (this._runId ?? 0) + 1;
    this._runId = runId;
    // A new run makes earlier results stale; clearing them also lets errors render.
    this._data = null;
    this._error = null;
    const { org, site } = this._hashState ?? {};
    if (!org || !site) {
      this._loading = false;
      this._setRefreshBusy(false);
      this._error = 'No page is open.';
      return this._verdictFor({ error: this._error });
    }
    this._loading = true;
    this._setRefreshBusy(true);
    try {
      const [pageUrl] = await Promise.all([this._resolvePageUrl(), ensureRenderer()]);
      if (this._runId !== runId) return null;
      const response = await evaluatePage(pageUrl);
      if (this._runId !== runId) return null;
      this._data = adaptEvaluation(response);
      return this._verdictFor({ data: this._data });
    } catch (e) {
      if (this._runId !== runId) return null;
      this._error = e?.detail || 'Could not evaluate the page. Try again.';
      return this._verdictFor({ error: this._error });
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
    btn.setAttribute('aria-label', 'Refresh evaluation');
    btn.disabled = !!this._loading;
    btn.innerHTML = this._loading ? REFRESH_SPINNER_HTML : REFRESH_ICON_HTML;
    btn.addEventListener('click', () => this._evaluateAndReport());
    this._headerRefreshBtn = btn;
    return btn;
  }

  // Honored by the tool panel for first-party views (see tool-panel.js).
  getHeaderActions() {
    return this._getHeaderRefreshButton();
  }

  render() {
    if (this._loading && !this._data) {
      return html`
        <div class="ew-preflight-status">
          <span class="da-loading-spinner"></span>
          <span>Evaluating page…</span>
        </div>`;
    }
    if (this._error && !this._data) {
      return html`
        <div class="ew-preflight-status" role="alert">
          <p>${this._error}</p>
          <button class="ew-preflight-retry" @click=${() => this._evaluateAndReport()}>Try again</button>
        </div>`;
    }
    if (!this._data) return nothing;
    return html`<nx-page-eval .data=${this._data}></nx-page-eval>`;
  }
}

if (!customElements.get('ew-preflight')) {
  customElements.define('ew-preflight', EwPreflight);
}
