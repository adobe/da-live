import { LitElement, html, nothing } from 'da-lit';
import { createBranchingClient } from '../branching-client.js';
import { matchesDefaultSite } from './entry.js';

const TEXT = new Set(['html', 'json', 'config']);
const IMAGES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);
const REVERTIBLE = new Set(['edit', 'merge', 'revert']);
const validRevision = (value) => Number.isSafeInteger(value) && value >= 0;
const validState = (value) => ['present', 'absent'].includes(value?.state);

function responseRevision(response) {
  const raw = response.headers.get('Branch-Revision');
  const value = Number(raw);
  if (!raw || !/^\d+$/.test(raw) || !validRevision(value)) throw new Error('Missing or invalid default revision');
  return value;
}

function moved() {
  const error = new Error('Default changed. Refresh history and review again.');
  error.code = 'REVISION_CHANGED';
  return error;
}

export class DaSiteHistory extends LitElement {
  static properties = {
    org: { type: String },
    site: { type: String },
    client: { attribute: false },
    _page: { state: true },
    _detail: { state: true },
    _conflicts: { state: true },
    _restore: { state: true },
    _error: { state: true },
    _notice: { state: true },
    _busy: { state: true },
  };

  constructor() {
    super();
    this._generation = 0;
    this._urls = [];
    this._hashChange = () => this.close();
  }

  connectedCallback() {
    super.connectedCallback();
    this._hash = window.location.hash;
    window.addEventListener('hashchange', this._hashChange);
    if (!matchesDefaultSite(this.org, this.site, this._hash)) {
      this.close();
      return;
    }
    if (!this.client) this.client = createBranchingClient({ org: this.org, site: this.site });
    this.refresh();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('hashchange', this._hashChange);
    this._generation += 1;
    this.clearPreview();
  }

  close() { this.remove(); }

  clearPreview() {
    this._urls.forEach((url) => URL.revokeObjectURL(url));
    this._urls = [];
    this._detail = undefined;
    this._conflicts = undefined;
    this._restore = undefined;
  }

  current(generation) {
    return this.isConnected && this._generation === generation
      && this._hash === window.location.hash
      && matchesDefaultSite(this.org, this.site);
  }

  async run(work) {
    if (this._busy || !this.current(this._generation)) return;
    const generation = this._generation;
    const valid = () => this.current(generation);
    this._busy = true;
    this._error = undefined;
    try {
      await work(valid);
    } catch (error) {
      if (!valid()) return;
      if (error.code === 'REVISION_CHANGED') {
        this.clearPreview();
        this._notice = 'Default changed. Refresh history and review again.';
      } else this._error = error.message || 'Could not load site history.';
    } finally {
      if (valid()) this._busy = false;
      else this.clearPreview();
    }
  }

  async latest(pin, valid) {
    const { defaultRevision } = await this.client.listLogWithRevision({ limit: 1 });
    if (!valid()) return false;
    if (defaultRevision !== pin) throw moved();
    return true;
  }

  refresh() {
    return this.run(async (valid) => {
      this.clearPreview();
      this._notice = undefined;
      const { data, defaultRevision } = await this.client.listLogWithRevision({ limit: 25 });
      if (!valid()) return;
      if (!Array.isArray(data?.commits) || !validRevision(defaultRevision)) throw new Error('Invalid log response');
      this._page = { ...data, defaultRevision };
    });
  }

  loadMore() {
    return this.run(async (valid) => {
      const page = this._page;
      if (!page?.next) return;
      const result = await this.client.listLogWithRevision({ after: page.next, limit: 25 });
      if (!valid() || this._page !== page) return;
      if (result.defaultRevision !== page.defaultRevision) throw moved();
      if (!Array.isArray(result.data?.commits)) throw new Error('Invalid log response');
      const commits = [...page.commits, ...result.data.commits];
      this._page = { ...page, commits, next: result.data.next };
    });
  }

  async readValue(change, side, revision, pin) {
    const metadata = change[side];
    if (!validState(metadata)) throw new Error('Invalid log value');
    if (metadata.state === 'absent') return { ...metadata };
    const response = await this.client.getLogValue(revision, change.index, side);
    if (responseRevision(response) !== pin) throw moved();
    const blob = await response.blob();
    return this.valueFromBlob(metadata, change.itemKind, response, blob);
  }

  async valueFromBlob(metadata, kind, response, blob) {
    const type = response.headers.get('Content-Type') || 'application/octet-stream';
    const value = { ...metadata, type, size: blob.size };
    if (TEXT.has(kind)) value.text = await blob.text();
    else if (kind === 'media' && IMAGES.has(type.split(';')[0].trim().toLowerCase())) value.blob = blob;
    return value;
  }

  attachPreviews(values) {
    values.forEach((value) => {
      if (!value.blob) return;
      const type = value.type.split(';')[0].trim().toLowerCase();
      value.preview = URL.createObjectURL(new Blob([value.blob], { type }));
      this._urls.push(value.preview);
      delete value.blob;
    });
  }

  select(commit) {
    return this.run(async (valid) => {
      this.clearPreview();
      this._notice = undefined;
      if (!validRevision(commit?.revision)) throw new Error('Invalid commit revision');
      const { data, defaultRevision: pin } = await this.client
        .getCommitWithRevision(commit.revision);
      if (!valid()) return;
      if (!validRevision(pin) || data?.commit?.revision !== commit.revision
        || !Array.isArray(data.changes)) {
        throw new Error('Invalid commit detail');
      }
      const changes = await Promise.all(data.changes.map(async (change) => {
        if (!validRevision(change.index) || typeof change.path !== 'string'
          || !['html', 'json', 'config', 'media'].includes(change.itemKind)) throw new Error('Invalid change');
        const [before, after] = await Promise.all(['before', 'after']
          .map((side) => this.readValue(change, side, commit.revision, pin)));
        return { ...change, before, after };
      }));
      if (!valid() || !await this.latest(pin, valid)) return;
      this.attachPreviews(changes.flatMap(({ before, after }) => [before, after]));
      this._detail = { commit: data.commit, changes, pin };
    });
  }

  async prepareConflicts(conflicts, detail, valid) {
    if (!Array.isArray(conflicts) || !conflicts.length) throw new Error('Invalid conflict response');
    const seen = new Set();
    const entries = await Promise.all(conflicts.map(async (conflict) => {
      const change = detail.changes.find((item) => item.path === conflict.path);
      if (!change || seen.has(conflict.path) || !validState(conflict.current)
        || !validState(conflict.before) || !validState(conflict.after)) throw new Error('Invalid conflict');
      seen.add(conflict.path);
      let current = { ...conflict.current };
      if (current.state === 'present') {
        const response = await this.client.getCurrentValue(change.path);
        if (responseRevision(response) !== detail.pin) throw moved();
        const blob = await response.blob();
        current = await this.valueFromBlob(current, change.itemKind, response, blob);
      }
      return { change, current, choice: '', draft: '' };
    }));
    if (!valid() || !await this.latest(detail.pin, valid)) return;
    this.attachPreviews(entries.map(({ current }) => current));
    this._conflicts = { entries, detail };
  }

  revert() {
    return this.run(async (valid) => {
      const detail = this._detail;
      if (!detail || !REVERTIBLE.has(detail.commit.kind)) return;
      this._restore = undefined;
      const resolutions = Object.create(null);
      if (this._conflicts) {
        if (this._conflicts.detail !== detail) return;
        for (const entry of this._conflicts.entries) {
          if (!['current', 'reverted', 'edited'].includes(entry.choice)) throw new Error('Choose a resolution for every conflict.');
          if (entry.choice === 'edited') {
            const { validateEditedValue } = await import('../branch-conflicts/validate-edited-value.js');
            validateEditedValue(entry.change.itemKind, entry.draft);
            const contentType = entry.current.type || entry.change.after.type
              || entry.change.before.type;
            if (!contentType) throw new Error('Missing content type for edited resolution');
            resolutions[entry.change.path] = { edited: entry.draft, contentType };
          } else resolutions[entry.change.path] = entry.choice;
        }
      }
      if (!valid() || this._detail !== detail || !await this.latest(detail.pin, valid)) return;
      try {
        const result = await this.client.revert(detail.commit.revision, {
          expectedDefaultRevision: detail.pin,
          ...(this._conflicts ? { resolutions } : {}),
        });
        if (!valid()) return;
        if (!validRevision(result?.revertRevision)) throw new Error('Invalid revert response');
        this.clearPreview();
        this._page = undefined;
        this._notice = 'Revert applied. Refresh history to see the new commit.';
      } catch (error) {
        if (valid() && error.code === 'REVERT_CONFLICTS') {
          await this.prepareConflicts(error.details?.conflicts, detail, valid);
        } else throw error;
      }
    });
  }

  previewRestore() {
    return this.run(async (valid) => {
      const detail = this._detail;
      this._restore = undefined;
      this._conflicts = undefined;
      if (!detail || !await this.latest(detail.pin, valid)) return;
      const { revision } = detail.commit;
      const expectedDefaultRevision = detail.pin;
      const result = await this.client.restore({ revision, expectedDefaultRevision, dryRun: true });
      if (!valid() || this._detail !== detail) return;
      if (!Array.isArray(result?.paths) || result.paths.some((path) => typeof path !== 'string')) {
        throw new Error('Invalid restore preview');
      }
      if (!await this.latest(detail.pin, valid)) return;
      this._restore = { detail, paths: result.paths };
    });
  }

  confirmRestore() {
    return this.run(async (valid) => {
      const preview = this._restore;
      if (!preview || preview.detail !== this._detail
        || !await this.latest(preview.detail.pin, valid)) return;
      const result = await this.client.restore({
        revision: preview.detail.commit.revision,
        expectedDefaultRevision: preview.detail.pin,
        dryRun: false,
      });
      if (!valid()) return;
      if (!validRevision(result?.revertRevision)) throw new Error('Invalid restore response');
      this.clearPreview();
      this._page = undefined;
      this._notice = 'Restore applied. Refresh history to see the new commit.';
    });
  }

  updateConflict(index, field, value) {
    if (this._busy || !this._conflicts) return;
    const entries = this._conflicts.entries
      .map((entry, i) => (i === index ? { ...entry, [field]: value } : entry));
    this._conflicts = { ...this._conflicts, entries };
  }

  renderValue(label, value) {
    return html`<div><strong>${label}</strong>
      ${value.state === 'absent' ? html`<p>Absent</p>` : html`
        <p>${value.type} · ${value.size} bytes ${value.hash ? `· ${value.hash}` : ''}</p>
        ${value.text !== undefined ? html`<pre>${value.text}</pre>` : nothing}
        ${value.preview ? html`<img src=${value.preview} alt=${label}>` : nothing}`}
    </div>`;
  }

  renderConflicts() {
    if (!this._conflicts) return nothing;
    return html`<h3>Resolve revert conflicts</h3>
      ${this._conflicts.entries.map((entry, index) => html`<article>
        <h4>${entry.change.path} · ${entry.change.itemKind}</h4>
        <div class="values">${this.renderValue('Before', entry.change.before)}
          ${this.renderValue('After', entry.change.after)}${this.renderValue('Current', entry.current)}</div>
        <label>Resolution <select .value=${entry.choice} ?disabled=${this._busy}
          @change=${(event) => this.updateConflict(index, 'choice', event.target.value)}>
          <option value="">Choose…</option><option value="current">Keep current</option>
          <option value="reverted">Use reverted</option>
          ${TEXT.has(entry.change.itemKind) ? html`<option value="edited">Edited text</option>` : nothing}
        </select></label>
        ${entry.choice === 'edited' ? html`<label>Edited source<textarea .value=${entry.draft}
          ?disabled=${this._busy} @input=${(event) => this.updateConflict(index, 'draft', event.target.value)}></textarea></label>` : nothing}
      </article>`)}
      <button ?disabled=${this._busy} @click=${this.revert}>Apply resolutions</button>`;
  }

  render() {
    const detail = this._detail;
    return html`<style>
      :host { position: fixed; inset: 0; z-index: 10000; background: #0008; display: grid; place-items: center; }
      section { background: white; color: #222; width: min(96vw, 1100px); max-height: 90vh; overflow: auto; padding: 1.5rem; }
      header, .actions, .values { display: flex; gap: 1rem; align-items: start; }
      header { justify-content: space-between; }
      .values > div { flex: 1; min-width: 0; }
      pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 20rem; overflow: auto; background: #f5f5f5; padding: .5rem; }
      img { max-width: 100%; max-height: 15rem; }
      textarea { display: block; width: 100%; min-height: 8rem; box-sizing: border-box; }
      li, article { margin: .75rem 0; }
    </style><section role="dialog" aria-modal="true" aria-label="Site history">
      <header><h2>Site history · ${this.org}/${this.site}</h2><button @click=${this.close}>Close</button></header>
      <div class="actions"><button ?disabled=${this._busy} @click=${this.refresh}>Refresh</button></div>
      ${this._busy ? html`<p>Loading…</p>` : nothing}
      ${this._error ? html`<p role="alert">${this._error}</p>` : nothing}
      ${this._notice ? html`<p role="status">${this._notice}</p>` : nothing}
      ${this._page ? html`<ul>${this._page.commits.map((commit) => html`<li>
        <button ?disabled=${this._busy} @click=${() => this.select(commit)}>
          ${commit.kind} · ${commit.revision} · ${(commit.users || []).map((user) => user.email).join(', ')}
          · ${commit.createdAt} ${commit.branchId ? `· ${commit.branchId}` : ''}</button>
        <div>${(commit.paths || []).join(', ')}</div>
      </li>`)}</ul>${this._page.next ? html`<button ?disabled=${this._busy} @click=${this.loadMore}>Load more</button>` : nothing}` : nothing}
      ${detail ? html`<h3>Revision ${detail.commit.revision} · ${detail.commit.kind}</h3>
        ${detail.changes.map((change) => html`<article><h4>${change.path} · ${change.itemKind} · ${change.op}</h4>
          <div class="values">${this.renderValue('Before', change.before)}${this.renderValue('After', change.after)}</div></article>`)}
        <div class="actions">${REVERTIBLE.has(detail.commit.kind) && !this._conflicts
    ? html`<button ?disabled=${this._busy} @click=${this.revert}>Revert commit</button>` : nothing}
          <button ?disabled=${this._busy} @click=${this.previewRestore}>Restore site to this point</button></div>
        ${this.renderConflicts()}
        ${this._restore ? html`<h3>Confirm restore to revision ${detail.commit.revision}</h3>
          <p>These paths will change:</p><ul>${this._restore.paths.map((path) => html`<li>${path}</li>`)}</ul>
          <button ?disabled=${this._busy} @click=${this.confirmRestore}>Confirm restore</button>
          <button ?disabled=${this._busy} @click=${() => { this._restore = undefined; }}>Cancel</button>` : nothing}` : nothing}
    </section>`;
  }
}

customElements.define('da-site-history', DaSiteHistory);
