import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import { getPreviewOrigin } from '../editor-utils/editor-utils.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { reportPreflightStatus } from '../editor-utils/preflight-bridge.js';
import { takePendingPreflightRequest } from '../editor-utils/preflight-responder.js';
import { adaptEvaluation } from './adapter.js';
import { evaluatePage } from './api.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);

let panelEventsPromise;
const panelEvents = () => {
  panelEventsPromise ??= import(`${getNx()}/utils/panel.js`);
  return panelEventsPromise;
};

const style = await loadStyle(import.meta.url);
const baseStyle = await loadStyle(new URL('../../shared/styles/base.css', import.meta.url).href);

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

class EwGovernance extends LitElement {
  static properties = {
    _loading: { state: true },
    _error: { state: true },
    _data: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [baseStyle, style];
    this._unsubHash = hashChange.subscribe((state) => { this._hashState = state; });
    // Answer a publish gate that runs while the panel is already mounted.
    this._unsubRun = canvasBus.preflightRunRequest.subscribe(this._handlePreflightRun);
    if (!this._started) {
      this._started = true;
      // If a publish opened this panel, run for that gate; otherwise a plain first-open
      // evaluation. Later page navigation does not re-run; only the header refresh does.
      const pending = takePendingPreflightRequest();
      if (pending) this._handlePreflightRun(pending);
      else this._evaluateAndReport();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubHash?.();
    this._unsubRun?.();
    // Unmounting before a gate settles frees the waiting publish immediately.
    this._cancelGate();
  }

  get _pageUrl() {
    const { org, site, path } = this._hashState ?? {};
    if (!org || !site) return '';
    const suffix = path ? `/${path.replace(/^\//, '')}` : '';
    return `${getPreviewOrigin(org, site)}${suffix}`;
  }

  // The document path the publish gate matches STATUS against. Mirrors da-nx's
  // buildPrepareDetails().fullpath (`/org/site/path.html`) so a non-gate refresh
  // updates the gate's Publish dot. Gate runs echo the run's path instead.
  get _docFullpath() {
    const { org, site, path } = this._hashState ?? {};
    if (!org || !site || !path) return '';
    const docPath = path.startsWith('/') ? path : `/${path}`;
    const pathname = docPath.endsWith('/') || /\.(html|json)$/.test(docPath) ? docPath : `${docPath}.html`;
    return `/${org}/${site}${pathname}`;
  }

  _resultStatus() {
    if (this._error) return 'fail';
    return this._data?.failed === 0 ? 'success' : 'fail';
  }

  // Run the checks and, outside a gate, report the verdict so the Publish dot tracks it.
  async _evaluateAndReport() {
    await this._evaluate();
    if (this._gateRequestId) return;
    reportPreflightStatus({ path: this._docFullpath, status: this._resultStatus() });
  }

  _handlePreflightRun = async (detail) => {
    const requestId = detail?.requestId;
    const path = detail?.path ?? detail?.paths?.[0];
    if (!requestId || !path) return;
    // The pending store (first open) and the live subscription (re-publish) can both
    // deliver the same run; only act once.
    if (requestId === this._lastGateRequestId) return;
    this._started = true;
    this._lastGateRequestId = requestId;
    this._gateRequestId = requestId;
    this._gatePath = path;
    this._gateSettled = false;
    const { PANEL_EVENT } = await panelEvents();
    const onClose = () => this._cancelGate();
    document.addEventListener(PANEL_EVENT.CLOSE, onClose);
    this._removePanelClose = () => document.removeEventListener(PANEL_EVENT.CLOSE, onClose);
    await this._evaluate();
    this._finishGate(this._resultStatus());
  };

  _finishGate(status) {
    if (this._gateSettled || !this._gateRequestId) return;
    this._gateSettled = true;
    this._removePanelClose?.();
    this._removePanelClose = null;
    const { _gateRequestId: requestId, _gatePath: path } = this;
    this._gateRequestId = null;
    this._gatePath = null;
    reportPreflightStatus({ path, status, requestId });
  }

  _cancelGate() {
    this._finishGate('cancelled');
  }

  async _evaluate() {
    const pageUrl = this._pageUrl;
    if (!pageUrl) {
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
      const response = await evaluatePage(pageUrl);
      if (this._runId !== runId) return;
      this._data = adaptEvaluation(response);
    } catch (e) {
      if (this._runId !== runId) return;
      this._error = e?.detail || 'Could not evaluate the page. Try again.';
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
        <div class="ew-governance-status">
          <span class="da-loading-spinner"></span>
          <span>Evaluating page…</span>
        </div>`;
    }
    if (this._error && !this._data) {
      return html`
        <div class="ew-governance-status" role="alert">
          <p>${this._error}</p>
          <button class="ew-governance-retry" @click=${() => this._evaluateAndReport()}>Try again</button>
        </div>`;
    }
    if (!this._data) return nothing;
    return html`<nx-page-eval .data=${this._data}></nx-page-eval>`;
  }
}

if (!customElements.get('ew-governance')) {
  customElements.define('ew-governance', EwGovernance);
}
