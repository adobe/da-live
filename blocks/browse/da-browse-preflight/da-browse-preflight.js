import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import { getPreviewOrigin } from '../../canvas/editor-utils/editor-utils.js';
import { adaptEvaluation } from '../../canvas/ew-governance/adapter.js';
import { evaluatePage } from '../../canvas/ew-governance/api.js';
import '../../shared/da-dialog/da-dialog.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const SHARED = await loadStyle(new URL('../../shared/styles/base.css', import.meta.url).href);
const STYLE = await loadStyle(import.meta.url);

const REFRESH_ICON = '/img/icons/s2-icon-refresh-20-n.svg';
const CHEVRON_ICON = '/img/icons/s2-icon-chevronright-20-n.svg';

// da-dialog only renders its footer region when `action` is truthy; we supply our
// own two buttons via the footer-right slot, so this is just a presence sentinel.
const DIALOG_FOOTER = { style: '', label: '', click: () => {} };

// The result renderer (<nx-page-eval>) lives in da-nx; importing it defines the
// element and loads its CSS as a side effect. Memoized so repeated evaluations
// don't re-import — mirrors ew-governance.js.
let rendererPromise;
function ensureRenderer() {
  rendererPromise ??= import(`${getNx2()}/blocks/chat-ao/artifacts/page-evaluation.js`);
  return rendererPromise;
}

// Iterates the selected pages, runs the shared governance evaluation for each,
// and shows the per-page results (reusing <nx-page-eval>). Offers "Publish
// Passing" — publish only the pages that passed — and "Close".
export default class DaBrowsePreflight extends LitElement {
  static properties = {
    items: { attribute: false },
    _rows: { state: true },
  };

  constructor() {
    super();
    this.items = [];
    this._rows = [];
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [SHARED, STYLE];
    this._rows = this.items.map((item) => ({ item, status: 'loading', data: null, error: null, runId: 0 }));
    this._evaluateAll();
  }

  async _evaluateAll() {
    await ensureRenderer();
    const { Queue } = await import(`${getNx()}/public/utils/tree.js`);
    const queue = new Queue((row) => this._evaluateRow(row), 5, null, 250);
    await Promise.all(this._rows.map((row) => queue.push(row)));
  }

  // Build the page's preview URL exactly as the canvas does: preview origin +
  // the page path relative to the site, with the trailing .html stripped.
  _pageUrl(item) {
    const [, org, site, ...rest] = item.path.split('/');
    const rel = rest.join('/').replace(/\.html$/, '');
    const suffix = rel ? `/${rel}` : '';
    return `${getPreviewOrigin(org, site)}${suffix}`;
  }

  async _evaluateRow(row) {
    // Guard against a stale response overwriting a newer re-run of the same row.
    const runId = row.runId + 1;
    row.runId = runId;
    row.status = 'loading';
    row.error = null;
    this._rows = [...this._rows];
    try {
      const response = await evaluatePage(this._pageUrl(row.item));
      if (row.runId !== runId) return;
      row.data = adaptEvaluation(response);
      row.status = row.data.failed === 0 ? 'pass' : 'fail';
    } catch (e) {
      if (row.runId !== runId) return;
      row.status = 'error';
      row.error = e?.detail || e?.message || 'Could not evaluate the page.';
    } finally {
      if (row.runId === runId) this._rows = [...this._rows];
    }
  }

  _rerun(e, row) {
    // The button lives inside <summary>; don't let the click toggle the row.
    e.preventDefault();
    e.stopPropagation();
    this._evaluateRow(row);
  }

  get _busy() {
    return this._rows.some((row) => row.status === 'loading');
  }

  get _passing() {
    return this._rows.filter((row) => row.status === 'pass').map((row) => row.item);
  }

  _closeDialog() {
    this.shadowRoot.querySelector('da-dialog')?.close();
  }

  _handleDialogClose() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  _handlePublishPassing() {
    const items = this._passing;
    if (!items.length) return;
    this.dispatchEvent(new CustomEvent('publish-passing', { detail: { items }, bubbles: true, composed: true }));
    this._closeDialog();
  }

  _renderStatusIcon(row) {
    if (row.status === 'loading') return html`<span class="da-loading-spinner" aria-hidden="true"></span>`;
    const tone = row.status === 'pass' ? 'positive' : 'negative';
    const label = row.status === 'pass' ? 'Passed' : 'Failed';
    return html`<span class="ui-artifact-pe-icon ui-artifact-pe-tone-${tone}" role="img" aria-label=${label} title=${label}></span>`;
  }

  // eslint-disable-next-line class-methods-use-this
  _renderRowBody(row) {
    if (row.status === 'error') {
      return html`<p class="da-preflight-error" role="alert">${row.error}</p>`;
    }
    if (row.data) return html`<nx-page-eval .data=${row.data}></nx-page-eval>`;
    return nothing;
  }

  _renderRow(row) {
    return html`
      <details class="da-preflight-row">
        <summary class="da-preflight-summary">
          <span class="da-preflight-chevron">
            <svg viewBox="0 0 20 20" aria-hidden="true"><use href="${CHEVRON_ICON}#icon"></use></svg>
          </span>
          <span class="da-preflight-path" title=${row.item.path}>${row.item.path}</span>
          <span class="da-preflight-row-actions">
            <button
              class="da-icon-btn"
              type="button"
              aria-label="Re-run evaluation"
              ?disabled=${row.status === 'loading'}
              @click=${(e) => this._rerun(e, row)}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><use href="${REFRESH_ICON}#icon"></use></svg>
            </button>
            ${this._renderStatusIcon(row)}
          </span>
        </summary>
        <div class="da-preflight-body">
          ${this._renderRowBody(row)}
        </div>
      </details>`;
  }

  render() {
    const passing = this._passing;
    return html`
      <da-dialog
        title="Preflight"
        size="auto"
        emphasis="quiet"
        .action=${DIALOG_FOOTER}
        @close=${this._handleDialogClose}>
        <div class="da-preflight-rows">
          ${this._rows.map((row) => this._renderRow(row))}
        </div>
        <div slot="footer-right" class="da-preflight-footer">
          <sl-button @click=${this._closeDialog}>Close</sl-button>
          <sl-button
            class="accent"
            ?disabled=${this._busy || passing.length === 0}
            @click=${this._handlePublishPassing}>
            Publish Passing${passing.length ? ` (${passing.length})` : ''}
          </sl-button>
        </div>
      </da-dialog>`;
  }
}

customElements.define('da-browse-preflight', DaBrowsePreflight);
