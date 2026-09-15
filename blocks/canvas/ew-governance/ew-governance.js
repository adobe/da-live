import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import { getPreviewOrigin } from '../editor-utils/editor-utils.js';
import { adaptEvaluation } from './adapter.js';
import { evaluatePage } from './api.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);

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
    // Run the evaluation once, on first open. Later page navigation does not
    // re-run it; only the header refresh button does.
    if (!this._started) {
      this._started = true;
      this._evaluate();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubHash?.();
  }

  get _pageUrl() {
    const { org, site, path } = this._hashState ?? {};
    if (!org || !site) return '';
    const suffix = path ? `/${path.replace(/^\//, '')}` : '';
    return `${getPreviewOrigin(org, site)}${suffix}`;
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
      this._error = 'Could not evaluate the page. Try again.';
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
    btn.addEventListener('click', () => this._evaluate());
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
          <button class="ew-governance-retry" @click=${() => this._evaluate()}>Try again</button>
        </div>`;
    }
    if (!this._data) return nothing;
    return html`<nx-page-eval .data=${this._data}></nx-page-eval>`;
  }
}

if (!customElements.get('ew-governance')) {
  customElements.define('ew-governance', EwGovernance);
}
