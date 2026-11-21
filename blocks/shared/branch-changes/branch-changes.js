import { LitElement, html, nothing } from 'da-lit';
import styles from './branch-changes-styles.js';
import '../branch-diff/branch-diff.js';

const SAFE_IMAGES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);
const TEXT_KINDS = new Set(['html', 'json', 'config']);

/** A comparison is always read at the two revisions returned by its first page. */
export class DaBranchChanges extends LitElement {
  static properties = {
    branchId: { type: String },
    client: { attribute: false },
    _open: { state: true },
    _summary: { state: true },
    _detail: { state: true },
    _selectedPath: { state: true },
    _loading: { state: true },
    _detailLoading: { state: true },
    _error: { state: true },
    _detailError: { state: true },
    _notice: { state: true },
  };

  constructor() {
    super();
    this._generation = 0;
    this._detailGeneration = 0;
    this._urls = [];
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  willUpdate(changed) {
    if (changed.has('branchId') || changed.has('client')) {
      const panel = this.shadowRoot.getElementById('branch-changes-panel');
      if (panel?.matches(':popover-open')) panel.hidePopover();
      this.reset();
      this._open = false;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.reset();
    this._open = false;
  }

  clearDetail() {
    this._detailGeneration += 1;
    this._urls.forEach((url) => URL.revokeObjectURL(url));
    this._urls = [];
    this._detail = undefined;
    this._selectedPath = undefined;
    this._detailError = undefined;
    this._detailLoading = false;
  }

  reset() {
    this._generation += 1;
    this.clearDetail();
    this._summary = undefined;
    this._loading = false;
    this._error = undefined;
    this._notice = undefined;
  }

  current(generation, branchId, client) {
    return this.isConnected && this._open && this._generation === generation
      && this.branchId === branchId && this.client === client;
  }

  positionPanel({ currentTarget }) {
    const panel = this.shadowRoot.getElementById('branch-changes-panel');
    const { top, bottom, left } = currentTarget.getBoundingClientRect();
    const gap = 12;
    const width = Math.min(720, window.innerWidth - 2 * gap);
    const below = window.innerHeight - bottom;
    const above = below < 300 && top > below;
    panel.style.setProperty('--panel-left', `${Math.max(gap, Math.min(left, window.innerWidth - width - gap))}px`);
    panel.style.setProperty('--panel-top', above ? 'auto' : `${bottom + 6}px`);
    panel.style.setProperty('--panel-bottom', above ? `${window.innerHeight - top + 6}px` : 'auto');
    panel.style.setProperty('--panel-height', `${Math.max(0, (above ? top : below) - 2 * gap)}px`);
  }

  toggle({ newState }) {
    this._open = newState === 'open';
    if (this._open) this.refresh();
    else this.reset();
  }

  refreshIfOpen() {
    if (this._open) this.refresh();
  }

  async refresh(notice) {
    this.reset();
    this._notice = notice;
    const generation = this._generation;
    const { branchId, client } = this;
    this._loading = true;
    try {
      const summary = await client.changes(branchId);
      if (!this.current(generation, branchId, client)) return;
      if (!Array.isArray(summary?.changes) || !Number.isSafeInteger(summary.branchRevision)
        || summary.branchRevision < 0 || !Number.isSafeInteger(summary.defaultRevision)
        || summary.defaultRevision < 0) throw new Error('Invalid comparison response');
      this._summary = summary;
    } catch (error) {
      if (this.current(generation, branchId, client)) this._error = error.message || 'Could not load changes.';
    } finally {
      if (this.current(generation, branchId, client)) this._loading = false;
    }
  }

  async loadMore() {
    const { branchId, client, _summary: summary } = this;
    const generation = this._generation;
    if (!summary?.next || this._loading) return;
    this._loading = true;
    this._error = undefined;
    try {
      const page = await client.changes(branchId, summary.next);
      if (!this.current(generation, branchId, client)) return;
      if (page.branchRevision !== summary.branchRevision
        || page.defaultRevision !== summary.defaultRevision) {
        await this.refresh('Revisions changed. The comparison was refreshed.');
        return;
      }
      if (!Array.isArray(page.changes)) throw new Error('Invalid comparison response');
      const changes = [...summary.changes, ...page.changes];
      this._summary = { ...summary, changes, next: page.next };
    } catch (error) {
      if (!this.current(generation, branchId, client)) return;
      if (error.code === 'REVISION_CHANGED') {
        await this.refresh('Revisions changed. The comparison was refreshed.');
      } else this._error = error.message || 'Could not load more changes.';
    } finally {
      if (this.current(generation, branchId, client)) this._loading = false;
    }
  }

  async select(change) {
    this.clearDetail();
    this._selectedPath = change.path;
    const detailGeneration = this._detailGeneration;
    const generation = this._generation;
    const { branchId, client, _summary: summary } = this;
    const { branchRevision, defaultRevision } = summary;
    const pins = { path: change.path, branchRevision, defaultRevision };
    const valid = () => this.current(generation, branchId, client)
      && this._detailGeneration === detailGeneration;
    this._detailLoading = true;
    try {
      const detail = await client.changesDetail(branchId, pins);
      if (!valid()) return;
      if (detail?.path !== change.path || detail.itemKind !== change.itemKind
        || !['present', 'absent'].includes(detail.default?.state)
        || !['present', 'absent'].includes(detail.branch?.state)) throw new Error('Invalid detail response');
      const values = await Promise.all(['default', 'branch'].map(async (side) => {
        const metadata = detail[side];
        if (metadata.state === 'absent') return { ...metadata };
        const response = await client.getChangeValue(branchId, { ...pins, side });
        const blob = await response.blob();
        return { ...metadata, blob, type: response.headers.get('Content-Type') || detail.contentType || 'application/octet-stream' };
      }));
      if (!valid()) return;
      const sides = await Promise.all(values.map(async (value) => {
        if (!value.blob) return value;
        if (TEXT_KINDS.has(detail.itemKind)) return { ...value, text: await value.blob.text() };
        return value;
      }));
      if (!valid()) return;
      sides.forEach((value) => {
        const mime = value.type?.split(';')[0].trim().toLowerCase();
        if (detail.itemKind === 'media' && value.blob && SAFE_IMAGES.has(mime)) {
          value.preview = URL.createObjectURL(new Blob([value.blob], { type: mime }));
          this._urls.push(value.preview);
        }
      });
      this._detail = { ...detail, default: sides[0], branch: sides[1] };
    } catch (error) {
      if (!valid()) return;
      if (error.code === 'REVISION_CHANGED') await this.refresh('Revisions changed. The comparison was refreshed.');
      else this._detailError = error.message || 'Could not load change detail.';
    } finally {
      if (valid()) this._detailLoading = false;
    }
  }

  renderSide(label, side, kind) {
    if (side.state === 'absent') return html`<section class="side"><h4>${label}</h4><p class="muted">Absent</p></section>`;
    let content = html`<p>Preview unavailable</p>`;
    if (kind === 'media') {
      content = html`
        <p>Type: ${side.type} · Size: ${side.blob.size} bytes · Hash: ${side.hash || 'Unavailable'}</p>
        ${side.preview ? html`<img src=${side.preview} alt=${`${label} image preview`}>` : nothing}
      `;
    }
    return html`<section class="side">
      <h4>${label}</h4>
      ${content}
    </section>`;
  }

  renderFiles(summary) {
    return html`
      <p class="revision"><span>Default <strong>r${summary.defaultRevision}</strong></span>
        <span aria-hidden="true">→</span> <span>Branch <strong>r${summary.branchRevision}</strong></span></p>
      ${summary.stale ? html`<p class="message warning" role="status">Default has new changes — sync required.
        This comparison includes default-only changes.</p>` : nothing}
      ${summary.changes.length ? html`<ul class="changes-list" aria-label="Changed files">
        ${summary.changes.map((change, index) => html`<li>
          <button type="button" class="file" aria-label=${change.path}
            aria-describedby=${`change-meta-${index}`}
            aria-pressed=${this._selectedPath === change.path} @click=${() => this.select(change)}>
            <span class="file-path" title=${change.path}>${change.path}</span>
            <span class="file-meta" id=${`change-meta-${index}`}>
              <span class="kind">${change.itemKind}</span>
              <span class="badge" data-change=${change.change}>${change.change}</span>
              ${change.defaultOnly ? html`<span class="badge">Default only</span>` : nothing}
            </span>
          </button>
        </li>`)}
      </ul>` : html`<p class="message muted">No changes.</p>`}
      ${summary.next ? html`<button class="panel-button" type="button"
        @click=${this.loadMore} ?disabled=${this._loading}>Load more</button>` : nothing}
    `;
  }

  render() {
    const summary = this._summary;
    return html`
      <button type="button" part=${this._open ? 'action active-action' : 'action'}
        popovertarget="branch-changes-panel" aria-haspopup="dialog"
        @click=${this.positionPanel} aria-expanded=${Boolean(this._open)}>
        <svg part="action-icon" width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5h12M4 10h8m-8 5h6m4-1 2 2 2-4"/></svg>
        Changes${summary ? ` (${summary.changes.length}${summary.next ? '+' : ''})` : ''}
      </button>
      <section id="branch-changes-panel" popover role="dialog" aria-labelledby="changes-title"
        @beforetoggle=${this.toggle}>
        <header>
          <div>
            <h2 id="changes-title">Branch changes</h2>
            <p class="muted">Default → Branch · ${this.branchId}</p>
          </div>
          <button class="panel-button" type="button" @click=${() => this.refresh()}
            ?disabled=${this._loading}>Refresh</button>
          <button class="panel-button close" type="button" popovertarget="branch-changes-panel"
            popovertargetaction="hide" aria-label="Close Changes">×</button>
        </header>
        <div class="content">
          ${this._notice ? html`<p class="message" role="status">${this._notice}</p>` : nothing}
          ${this._error ? html`<p class="message error" role="alert">${this._error}</p>` : nothing}
          ${summary ? this.renderFiles(summary) : nothing}
          ${this._loading ? html`<p class="message muted" role="status">Loading changes…</p>` : nothing}
          ${this._detailLoading ? html`<p class="message muted" role="status">Loading detail…</p>` : nothing}
          ${this._detailError ? html`<p class="message error" role="alert">${this._detailError}</p>` : nothing}
          ${this._detail ? html`<div class="detail">
            <h3>${this._detail.path}</h3>
            ${TEXT_KINDS.has(this._detail.itemKind) ? html`<da-branch-diff
              .itemKind=${this._detail.itemKind} .defaultSide=${this._detail.default}
              .branch=${this._detail.branch}></da-branch-diff>` : html`<div class="sides">
              ${this.renderSide('Default', this._detail.default, this._detail.itemKind)}
              ${this.renderSide('Branch', this._detail.branch, this._detail.itemKind)}
            </div>`}
          </div>` : nothing}
        </div>
      </section>
    `;
  }
}

customElements.define('da-branch-changes', DaBranchChanges);
