import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import { fetchWysiwygBranch, getPreviewOrigin } from '../../shared/preview-url.js';
import { adaptEvaluation } from '../../canvas/ew-preflight/adapter.js';
import { evaluatePage } from '../../canvas/ew-preflight/api.js';
import { getAuthToken } from '../../shared/utils.js';
import { iconPathForExt } from '../../shared/icons.js';
import '../../shared/da-dialog/da-dialog.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { PANEL_EVENT } = await import(`${getNx()}/utils/panel.js`);
const [BUTTONS, FORM, SPINNER, STYLE] = await Promise.all([
  loadStyle(`${getNx2()}/styles/buttons.css`),
  loadStyle(`${getNx2()}/styles/form.css`),
  loadStyle(`${getNx2()}/styles/spinner.css`),
  loadStyle(import.meta.url),
]);

// Label rows like the browse list: the item's name, never its extension.
function itemName(item) {
  if (item.name) return item.name;
  const last = item.path.split('/').pop();
  return item.ext ? last.replace(new RegExp(`\\.${item.ext}$`), '') : last;
}

// Site-relative path for the tooltip; pages drop .html as they do in preview URLs.
function itemPath(item) {
  const [, , , ...rest] = item.path.split('/');
  return `/${rest.join('/').replace(/\.html$/, '')}`;
}

const REFRESH_ICON = '/img/icons/s2-icon-refresh-20-n.svg';
const CHEVRON_ICON = '/img/icons/s2-icon-chevronright-20-n.svg';

// da-dialog only renders its footer region when `action` is truthy; we supply our
// own two buttons via the footer-right slot, so this is just a presence sentinel.
const DIALOG_FOOTER = { style: '', label: '', click: () => {} };

// The result renderer (<nx-page-eval>) lives in da-nx; importing it defines the
// element and loads its CSS as a side effect. Memoized so repeated evaluations
// don't re-import — mirrors ew-preflight.js.
let rendererPromise;
function ensureRenderer() {
  rendererPromise ??= import(`${getNx2()}/blocks/chat-ao/artifacts/page-evaluation.js`);
  return rendererPromise;
}

// Iterates the selected pages, runs the shared preflight evaluation for each,
// and shows the per-page results (reusing <nx-page-eval>). Offers "Publish
// Passing" — publish only the pages that passed — and "Close".
export default class EWBrowsePreflight extends LitElement {
  static properties = {
    items: { attribute: false },
    canPublish: { attribute: false },
    // Set by the host while it checks schedules after "Publish Passing".
    checking: { attribute: false },
    _rows: { state: true },
    _authError: { state: true },
  };

  constructor() {
    super();
    this.items = [];
    this.canPublish = false;
    this.checking = false;
    this._rows = [];
    this._authError = null;
  }

  connectedCallback() {
    super.connectedCallback();
    // Aborted on close so nobody's waiting on results keeps the evaluation service busy.
    this._abort = new AbortController();
    this.shadowRoot.adoptedStyleSheets = [BUTTONS, FORM, SPINNER, STYLE];
    // Only pages are evaluated; other publishable files have no checks and pass as-is.
    this._rows = this.items.map((item) => {
      const isPage = item.ext === 'html';
      return {
        item, isPage, status: isPage ? 'loading' : 'pass', data: null, error: null, runId: 0,
      };
    });
    this._evaluateAll();
    document.addEventListener(PANEL_EVENT.OPEN, this._handlePanelOpen);
  }

  disconnectedCallback() {
    this._abort?.abort();
    document.removeEventListener(PANEL_EVENT.OPEN, this._handlePanelOpen);
    super.disconnectedCallback();
  }

  async _evaluateAll() {
    const pages = this._rows.filter((row) => row.isPage);
    if (!pages.length) return;
    // Check auth once so a missing token yields one message, not one per page.
    if (!await getAuthToken()) {
      this._authError = 'You need to be signed in to run preflight.';
      pages.forEach((row) => {
        row.status = 'error';
        row.error = this._authError;
      });
      this._rows = [...this._rows];
      return;
    }
    await ensureRenderer();
    const { Queue } = await import(`${getNx()}/public/utils/tree.js`);
    const queue = new Queue((row) => this._evaluateRow(row), 5, null, 250);
    await Promise.all(pages.map((row) => queue.push(row)));
  }

  // Build the page's preview URL as the canvas does: preview origin for the page's
  // branch + the page path relative to the site, with the trailing .html stripped.
  // eslint-disable-next-line class-methods-use-this
  async _pageUrl(item) {
    const [, org, site, ...rest] = item.path.split('/');
    const rel = rest.join('/').replace(/\.html$/, '');
    // Same resolver the canvas uses (?ref, then `ew.wysiwygBranch` config); main if it fails.
    const branch = await fetchWysiwygBranch({ org, site, path: `${org}/${site}/${rel}` })
      .catch(() => 'main');
    const suffix = rel ? `/${rel}` : '';
    return `${getPreviewOrigin(org, site, branch)}${suffix}`;
  }

  async _evaluateRow(row) {
    const { signal } = this._abort;
    // Rows still queued when the dialog closes become no-ops.
    if (signal.aborted) return;
    // Guard against a stale response overwriting a newer re-run of the same row.
    const runId = row.runId + 1;
    row.runId = runId;
    row.status = 'loading';
    row.error = null;
    this._rows = [...this._rows];
    try {
      const pageUrl = await this._pageUrl(row.item);
      if (signal.aborted) return;
      const response = await evaluatePage(pageUrl, { signal });
      if (row.runId !== runId) return;
      row.data = adaptEvaluation(response, { evaluatedUrl: pageUrl });
      row.status = row.data.failed === 0 ? 'pass' : 'fail';
    } catch (e) {
      if (signal.aborted || row.runId !== runId) return;
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

  // The modal would cover the chat panel, e.g. after a result's "Add to chat" or "Apply change".
  _handlePanelOpen = ({ detail }) => {
    if (detail?.section === 'chat') this._closeDialog();
  };

  _handleDialogClose(e) {
    // da-dialog's own `close` is composed; stop it so the host only sees ours.
    e?.stopPropagation();
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  // The host closes the dialog once publishing starts, like the publish confirm.
  _handlePublishPassing() {
    const items = this._passing;
    if (!items.length || this.checking) return;
    this.dispatchEvent(new CustomEvent('publish-passing', { detail: { items }, bubbles: true, composed: true }));
  }

  _renderStatusIcon(row) {
    if (row.status === 'loading') return html`<span class="nx-loading-spinner" role="status" aria-label="Evaluating"></span>`;
    // Non-page files aren't evaluated: shown as not applicable, but still count as passing.
    let tone = row.status === 'pass' ? 'positive' : 'negative';
    let label = row.status === 'pass' ? 'Passed' : 'Failed';
    if (!row.isPage) {
      tone = 'neutral';
      label = 'Not applicable';
    }
    return html`<span class="ui-artifact-pe-icon ui-artifact-pe-tone-${tone}" role="img" aria-label=${label} title=${label}></span>`;
  }

  // eslint-disable-next-line class-methods-use-this
  _renderRowBody(row) {
    if (!row.isPage) return html`<p class="da-preflight-note">No Preflight needed for this file type</p>`;
    if (row.status === 'error') {
      return html`<p class="da-preflight-error" role="alert">${row.error}</p>`;
    }
    // Its suggestion modal emits a composed `close`; keep it from closing this dialog too.
    if (row.data) {
      return html`<nx-page-eval .data=${row.data} @close=${(e) => e.stopPropagation()}></nx-page-eval>`;
    }
    return nothing;
  }

  _renderRow(row) {
    return html`
      <details class="da-preflight-row">
        <summary class="da-preflight-summary">
          <span class="da-preflight-chevron">
            <svg viewBox="0 0 20 20" aria-hidden="true"><use href="${CHEVRON_ICON}#icon"></use></svg>
          </span>
          <span class="da-preflight-type">
            <svg viewBox="0 0 20 20" aria-hidden="true"><use href="${iconPathForExt(row.item.ext)}#icon"></use></svg>
          </span>
          <span class="da-preflight-path" title=${itemPath(row.item)}>${itemName(row.item)}</span>
          <span class="da-preflight-row-actions">
            ${row.isPage ? html`<button
              class="nx-action-btn-icon nx-btn-sm"
              type="button"
              aria-label="Re-run evaluation"
              ?disabled=${row.status === 'loading'}
              @click=${(e) => this._rerun(e, row)}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><use href="${REFRESH_ICON}#icon"></use></svg>
            </button>` : nothing}
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
        ${this._authError ? html`<p class="da-preflight-error" role="alert">${this._authError}</p>` : nothing}
        <div class="da-preflight-rows">
          ${this._rows.map((row) => this._renderRow(row))}
        </div>
        <div slot="footer-right" class="da-preflight-footer">
          <button type="button" class="nx-form-btn-secondary" ?disabled=${this.checking} @click=${this._closeDialog}>Cancel</button>
          ${this.canPublish ? html`
            <button
              type="button"
              class="nx-form-btn-primary"
              ?disabled=${this.checking || this._busy || passing.length === 0}
              @click=${this._handlePublishPassing}>
              ${this.checking ? 'Checking...' : `Publish Passing${passing.length ? ` (${passing.length})` : ''}`}
            </button>` : nothing}
        </div>
      </da-dialog>`;
  }
}

customElements.define('ew-browse-preflight', EWBrowsePreflight);
