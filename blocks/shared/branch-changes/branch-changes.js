import { LitElement, html, nothing } from 'da-lit';

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

  willUpdate(changed) {
    if (changed.has('branchId') || changed.has('client')) {
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

  toggle() {
    if (this._open) {
      this._open = false;
      this.reset();
    } else {
      this._open = true;
      this.refresh();
    }
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
    if (side.state === 'absent') return html`<section class="side"><h4>${label}</h4><p>Absent</p></section>`;
    let content = html`<p>Preview unavailable</p>`;
    if (kind === 'media') {
      content = html`
        <p>Type: ${side.type} · Size: ${side.blob.size} bytes · Hash: ${side.hash || 'Unavailable'}</p>
        ${side.preview ? html`<img src=${side.preview} alt=${`${label} image preview`}>` : nothing}
      `;
    } else if (TEXT_KINDS.has(kind)) content = html`<pre>${side.text}</pre>`;
    return html`<section class="side">
      <h4>${label}</h4>
      ${content}
    </section>`;
  }

  render() {
    const summary = this._summary;
    return html`
      <style>
        .comparison { padding: 1rem; border: 1px solid #ccc; background: white; color: #222; }
        .sides { display: flex; flex-wrap: wrap; gap: 1rem; }
        .side { flex: 1 1 15rem; min-width: 0; }
        pre { white-space: pre-wrap; overflow-wrap: anywhere; }
        img { max-width: 100%; max-height: 20rem; }
      </style>
      <button type="button" @click=${this.toggle} aria-expanded=${String(!!this._open)}>
        Changes${summary ? ` (${summary.changes.length}${summary.next ? '+' : ''})` : ''}
      </button>
      ${this._open ? html`<div class="comparison">
        <h3>Changes: Default → Branch · ${this.branchId}</h3>
        <button type="button" @click=${() => this.refresh()} ?disabled=${this._loading}>Refresh</button>
        ${this._notice ? html`<p role="status">${this._notice}</p>` : nothing}
        ${this._error ? html`<p role="alert">${this._error}</p>` : nothing}
        ${summary ? html`
          <p>Default revision ${summary.defaultRevision} → Branch revision ${summary.branchRevision}</p>
          ${summary.stale ? html`<p role="status">Default has new changes — sync required. This comparison includes default-only changes.</p>` : nothing}
          ${summary.changes.length ? html`<ul>${summary.changes.map((change) => html`
            <li><button type="button" @click=${() => this.select(change)}>${change.path}</button>
              — ${change.itemKind} · ${change.change}${change.defaultOnly ? ' · Default only' : ''}</li>
          `)}</ul>` : html`<p>No changes.</p>`}
          ${summary.next ? html`<button type="button" @click=${this.loadMore} ?disabled=${this._loading}>Load more</button>` : nothing}
        ` : nothing}
        ${this._loading ? html`<p role="status">Loading changes…</p>` : nothing}
        ${this._detailLoading ? html`<p role="status">Loading detail…</p>` : nothing}
        ${this._detailError ? html`<p role="alert">${this._detailError}</p>` : nothing}
        ${this._detail ? html`<h3>${this._detail.path}</h3><div class="sides">
          ${this.renderSide('Default', this._detail.default, this._detail.itemKind)}
          ${this.renderSide('Branch', this._detail.branch, this._detail.itemKind)}
        </div>` : nothing}
      </div>` : nothing}
    `;
  }
}

customElements.define('da-branch-changes', DaBranchChanges);
