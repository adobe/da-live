import { LitElement, html, nothing } from 'da-lit';
import { BranchingError } from '../branching-client.js';
import { withBranchBarrier } from '../branch-selector/navigation.js';
import { lockBranchEditing, unlockBranchEditing, rememberEditorBeforeBarrier, forgetUnneededEditorSnapshot } from './editing-lock.js';

const SIDES = ['base', 'branch', 'default'];
const TEXT = new Set(['html', 'json', 'config']);
const IMAGES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);
const CHOICES = new Set(['branch', 'default', 'edited', 'delete']);
const revision = (value) => Number.isSafeInteger(value) && value >= 0;
const segment = (value) => typeof value === 'string' && !!value && value !== '.' && value !== '..' && !/[/\\]/.test(value);
const uncertain = (error) => !(error instanceof BranchingError) || error.status >= 500;
const validResult = (result, statuses) => statuses.includes(result?.status)
  && (result.status !== 'needs-resolution' || segment(result.syncId));
const scope = (hash) => hash.split('/').slice(0, 3).join('/');

export class DaBranchConflicts extends LitElement {
  static properties = {
    branchId: { type: String },
    client: { attribute: false },
    _syncId: { state: true },
    _session: { state: true },
    _detail: { state: true },
    _busy: { state: true },
    _error: { state: true },
    _status: { state: true },
    _moved: { state: true },
    _confirm: { state: true },
    _retry: { state: true },
    _draft: { state: true },
    _ready: { state: true },
    _uncertain: { state: true },
  };

  constructor() {
    super();
    this._generation = 0;
    this._detailGeneration = 0;
    this._urls = [];
    this._beforeUnload = (event) => {
      if (this._draft !== undefined) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    this._hashChange = (event) => {
      // eslint-disable-next-line no-alert
      if (this._draft !== undefined && !window.confirm('Discard unsaved resolution text?')) {
        event.stopImmediatePropagation();
        history.replaceState(null, '', `${window.location.pathname}${window.location.search}${this._hash}`);
      } else this._hash = window.location.hash;
    };
    this._focus = () => {
      if (!this._busy && !this._syncId && !this._retry && !this._uncertain) this.loadMetadata();
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this._hash = window.location.hash;
    window.addEventListener('beforeunload', this._beforeUnload);
    window.addEventListener('hashchange', this._hashChange, true);
    window.addEventListener('focus', this._focus);
  }

  willUpdate(changed) {
    if (changed.has('branchId') || changed.has('client')) {
      this.reset();
      if (this.branchId && this.client) this.loadMetadata();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('beforeunload', this._beforeUnload);
    window.removeEventListener('hashchange', this._hashChange, true);
    window.removeEventListener('focus', this._focus);
    this.reset();
  }

  clearDetail() {
    this._detailGeneration += 1;
    this._urls.forEach((url) => URL.revokeObjectURL(url));
    this._urls = [];
    this._detail = undefined;
    this._draft = undefined;
  }

  reset() {
    this._generation += 1;
    this.clearDetail();
    this._session = undefined;
    this._syncId = undefined;
    this._busy = false;
    this._error = undefined;
    this._status = undefined;
    this._moved = false;
    this._confirm = false;
    this._retry = undefined;
    this._terminalRefresh = false;
    this._ready = false;
    this._uncertain = false;
    this._shouldUnlock = false;
  }

  capture() {
    const { branchId, client, _generation: generation } = this;
    const hash = scope(window.location.hash);
    return {
      branchId,
      client,
      generation,
      valid: () => this.isConnected && this.branchId === branchId
        && this.client === client && this._generation === generation
        && scope(window.location.hash) === hash,
    };
  }

  async loadMetadata() {
    this._generation += 1;
    const ctx = this.capture();
    await this.refreshMetadata(ctx);
  }

  async refreshMetadata(ctx, duringOperation = false) {
    this._error = undefined;
    try {
      const branch = await ctx.client.get(ctx.branchId);
      if (!ctx.valid()) return;
      if (branch?.id !== ctx.branchId || !revision(branch.revision)
        || (branch.activeSyncId != null && !segment(branch.activeSyncId))) throw new Error('Invalid branch metadata');
      this._ready = true;
      const releaseAfterRefresh = this._terminalRefresh;
      this._terminalRefresh = false;
      if (branch.activeSyncId) await this.openSession(ctx, branch.activeSyncId);
      else if (releaseAfterRefresh) {
        if (duringOperation) this._shouldUnlock = true;
        else unlockBranchEditing();
      }
    } catch (error) {
      if (ctx.valid()) this._error = error.message || 'Could not load branch metadata.';
    }
  }

  async openSession(ctx, syncId) {
    if (!segment(syncId)) throw new Error('Invalid sync session');
    this._syncId = syncId;
    lockBranchEditing();
    const session = await ctx.client.getSync(ctx.branchId, syncId);
    if (!ctx.valid() || this._syncId !== syncId) return;
    if (session?.syncId !== syncId || !revision(session.revision)
      || !revision(session.targetRevision)
      || !Array.isArray(session.entries)
      || session.entries.some((entry) => !segment(entry.entryId) || typeof entry.path !== 'string'
        || (!TEXT.has(entry.itemKind) && entry.itemKind !== 'media')
        || (entry.choice != null && !CHOICES.has(entry.choice))
        || SIDES.some((side) => !['present', 'absent'].includes(entry[side]?.state)))
      || new Set(session.entries.map((entry) => entry.entryId)).size
        !== session.entries.length) {
      throw new Error('Invalid sync session response');
    }
    this._session = session;
    this._status = 'Sync needs resolution. Branch editing is locked.';
  }

  async run(operation) {
    if (this._busy) return;
    // Supersede metadata and detail requests issued before the operation.
    this._generation += 1;
    const ctx = this.capture();
    this._busy = true;
    this._error = undefined;
    try { await operation(ctx); } catch (error) {
      if (ctx.valid()) this._error = error.message || 'Branch operation failed.';
    } finally {
      if (ctx.valid()) {
        this._busy = false;
        if (this._shouldUnlock) {
          this._shouldUnlock = false;
          unlockBranchEditing();
        }
        // The barrier restores its previous inert state; reapply any session lock.
        if (this._syncId || this._retry || this._uncertain || this._terminalRefresh) {
          lockBranchEditing();
        }
      } else if (this.isConnected && this.branchId === ctx.branchId && this.client === ctx.client
        && this._generation === ctx.generation) {
        this._busy = false;
        this.loadMetadata();
      }
      forgetUnneededEditorSnapshot();
    }
  }

  async branchRevision(ctx) {
    const branch = await ctx.client.get(ctx.branchId);
    if (!ctx.valid()) throw new Error('The current location changed');
    if (branch?.id !== ctx.branchId || !revision(branch.revision)) throw new Error('Invalid branch metadata');
    if (branch.activeSyncId) {
      await this.openSession(ctx, branch.activeSyncId);
      throw new Error('Sync already needs resolution.');
    }
    return branch.revision;
  }

  async result(ctx, result) {
    if (!ctx.valid()) return;
    if (result?.status === 'needs-resolution') {
      this._retry = undefined;
      this._uncertain = false;
      this._confirm = false;
      await this.openSession(ctx, result.syncId);
    } else if (['completed', 'published', 'nothing-to-publish'].includes(result?.status)) {
      this._retry = undefined;
      this._uncertain = false;
      this._confirm = false;
      const messages = {
        published: 'Changes merged into default — not published to live.',
        completed: 'Sync completed. You can now publish to default.',
        'nothing-to-publish': 'Nothing to publish.',
      };
      this._status = messages[result.status];
      this.dispatchEvent(new CustomEvent('branch-changed', { bubbles: true, composed: true }));
      this._shouldUnlock = true;
    } else throw new Error('Invalid branch operation response');
  }

  sync() {
    return this.run(async (ctx) => {
      rememberEditorBeforeBarrier();
      await withBranchBarrier(async () => {
        if (!ctx.valid()) throw new Error('The current location changed');
        const expected = await this.branchRevision(ctx);
        let result;
        try {
          result = await ctx.client.sync(ctx.branchId, expected);
          if (!validResult(result, ['completed', 'needs-resolution'])) throw new Error('Invalid sync response');
        } catch (error) {
          if (ctx.valid() && uncertain(error)) {
            this._uncertain = true;
            this._status = 'Sync result unknown. Reload this branch before editing.';
            lockBranchEditing();
          }
          throw error;
        }
        await this.result(ctx, result);
      });
    });
  }

  publish() {
    return this.run(async (ctx) => {
      if (this._retry) {
        const { expected, key } = this._retry;
        const result = await this.submitPublish(ctx, expected, key);
        if (result) await this.result(ctx, result);
        return;
      }
      rememberEditorBeforeBarrier();
      await withBranchBarrier(async () => {
        if (!ctx.valid()) throw new Error('The current location changed');
        const expected = await this.branchRevision(ctx);
        const key = crypto.randomUUID();
        const result = await this.submitPublish(ctx, expected, key);
        if (result) await this.result(ctx, result);
      });
    });
  }

  async submitPublish(ctx, expected, key) {
    try {
      const result = await ctx.client.publish(ctx.branchId, expected, key);
      if (!validResult(result, ['published', 'nothing-to-publish', 'needs-resolution'])) {
        throw new Error('Invalid publish response');
      }
      return result;
    } catch (error) {
      if (ctx.valid() && error instanceof BranchingError
        && error.status === 409 && error.code === 'REVISION_CHANGED') {
        this._retry = undefined;
        this._confirm = false;
        this._ready = false;
        this._terminalRefresh = true;
        this._status = 'Branch revision changed. Review the branch and confirm a new publish.';
        lockBranchEditing();
        await this.refreshMetadata(ctx, true);
        return undefined;
      }
      // An unstructured conflict does not identify a terminal replay outcome.
      const ambiguousConflict = error instanceof BranchingError
        && error.status === 409 && !error.code;
      if (ctx.valid() && (uncertain(error) || ambiguousConflict)) {
        this._retry = { expected, key };
        this._status = 'Publish result unknown. Editing is locked; retry the same request.';
        lockBranchEditing();
      }
      throw error;
    }
  }

  async select(entry) {
    // eslint-disable-next-line no-alert
    if (this._draft !== undefined && !window.confirm('Discard unsaved resolution text?')) return;
    this.clearDetail();
    const ctx = this.capture();
    const generation = this._detailGeneration;
    const syncId = this._syncId;
    const valid = () => ctx.valid() && this._syncId === syncId
      && this._detailGeneration === generation;
    try {
      const sides = await Promise.all(SIDES.map(async (side) => {
        const metadata = entry[side];
        if (metadata.state === 'absent') return metadata;
        const response = await ctx.client.getSyncValue(ctx.branchId, syncId, entry.entryId, side);
        const blob = await response.blob();
        const type = response.headers.get('Content-Type') || 'application/octet-stream';
        const text = TEXT.has(entry.itemKind) ? await blob.text() : undefined;
        return { ...metadata, blob, type, text };
      }));
      if (!valid()) return;
      sides.forEach((side) => {
        const mime = side.type?.split(';')[0].trim().toLowerCase();
        if (entry.itemKind === 'media' && side.blob && IMAGES.has(mime)) {
          side.preview = URL.createObjectURL(new Blob([side.blob], { type: mime }));
          this._urls.push(side.preview);
        }
      });
      this._detail = { entry, sides };
    } catch (error) {
      if (valid()) this._error = error.message || 'Could not load conflict values.';
    }
  }

  resolve(choice) {
    return this.run(async (ctx) => {
      const { _session: session, _syncId: syncId, _detail: detail } = this;
      if (!session || !detail || this._moved) return;
      const payload = { expectedSessionRevision: session.revision, choice };
      if (choice === 'edited') {
        if (!TEXT.has(detail.entry.itemKind) || this._draft === undefined) throw new Error('Enter edited source text.');
        const draft = this._draft;
        const { validateEditedValue } = await import('./validate-edited-value.js');
        validateEditedValue(detail.entry.itemKind, draft);
        if (!ctx.valid() || this._syncId !== syncId || this._session !== session
          || this._detail !== detail || this._draft !== draft) throw new Error('The resolution changed; retry.');
        payload.body = draft;
        payload.contentType = detail.sides.find((side) => side.type)?.type || 'text/plain';
      }
      let result;
      try {
        result = await ctx.client.resolve(ctx.branchId, syncId, detail.entry.entryId, payload);
      } catch (error) {
        if (ctx.valid() && error.status === 409) await this.openSession(ctx, syncId);
        throw error;
      }
      if (!ctx.valid() || this._syncId !== syncId) return;
      if (!revision(result?.revision)) throw new Error('Invalid resolution response');
      this._draft = undefined;
      await this.openSession(ctx, syncId);
    });
  }

  complete() {
    return this.run(async (ctx) => {
      const { _session: session, _syncId: syncId } = this;
      if (!session || this._moved || session.entries.some((entry) => !entry.choice)) return;
      try {
        await ctx.client.completeSync(ctx.branchId, syncId, session.revision);
        if (!ctx.valid() || this._syncId !== syncId) return;
        this._syncId = undefined;
        this._session = undefined;
        this.clearDetail();
        await this.result(ctx, { status: 'completed' });
      } catch (error) {
        if (ctx.valid() && error.code === 'SYNC_TARGET_MOVED') {
          this._moved = true;
          this._status = 'Default moved. Restart sync; all choices must be made again.';
        }
        throw error;
      }
    });
  }

  cancel(restart = false) {
    // eslint-disable-next-line no-alert
    if (this._draft !== undefined && !window.confirm('Discard unsaved resolution text?')) return undefined;
    return this.run(async (ctx) => {
      const syncId = this._syncId;
      const action = async () => {
        await ctx.client.cancelSync(ctx.branchId, syncId);
        if (!ctx.valid() || this._syncId !== syncId) return;
        this._syncId = undefined;
        this._session = undefined;
        this._moved = false;
        this.clearDetail();
        if (restart) {
          this._uncertain = true;
          this._status = 'Restart pending. Reload this branch if restart fails.';
          const expected = await this.branchRevision(ctx);
          await this.result(ctx, await ctx.client.sync(ctx.branchId, expected));
        } else {
          this._shouldUnlock = true;
          this._status = 'Sync cancelled. Branch content is unchanged.';
        }
      };
      if (restart) {
        rememberEditorBeforeBarrier();
        await withBranchBarrier(action);
      } else await action();
    });
  }

  renderSide(label, side, kind) {
    if (side.state === 'absent') return html`<section><h4>${label}</h4><p>Absent</p></section>`;
    return html`<section><h4>${label}</h4>${TEXT.has(kind) ? html`<pre>${side.text}</pre>` : html`
      <p>Type: ${side.type} · Size: ${side.blob.size} bytes · Hash: ${side.hash || 'Unavailable'}</p>
      ${side.preview ? html`<img src=${side.preview} alt=${`${label} preview`}>` : nothing}`}</section>`;
  }

  render() {
    const session = this._session;
    const detail = this._detail;
    const resolved = session?.entries.filter((entry) => entry.choice).length || 0;
    return html`
      <style>
        .panel { padding: 1rem; border: 1px solid #ccc; background: white; color: #222; }
        .sides { display: flex; flex-wrap: wrap; gap: 1rem; }
        section { flex: 1 1 15rem; min-width: 0; }
        pre { white-space: pre-wrap; overflow-wrap: anywhere; }
        img { max-width: 100%; max-height: 20rem; }
        textarea { width: 100%; min-height: 10rem; }
      </style>
      <button type="button" @click=${this.sync} ?disabled=${!this._ready || this._busy || !!this._syncId || !!this._retry || this._uncertain}>Sync from default</button>
      <button type="button" @click=${() => { this._confirm = true; }} ?disabled=${!this._ready || this._busy || !!this._syncId || !!this._retry || this._uncertain}>Publish to default</button>
      ${this._confirm && !this._retry ? html`<div class="panel" role="dialog" aria-label="Publish to default">
        <p>Publish all branch changes to default? This does not publish to AEM preview or live.</p>
        <button type="button" @click=${this.publish} ?disabled=${this._busy}>Confirm publish to default</button>
        <button type="button" @click=${() => { this._confirm = false; }} ?disabled=${this._busy}>Cancel</button>
      </div>` : nothing}
      ${this._retry ? html`<button type="button" @click=${this.publish} ?disabled=${this._busy}>Retry publish</button>` : nothing}
      ${this._status ? html`<p role="status">${this._status}</p>` : nothing}
      ${this._uncertain ? html`<button type="button" @click=${() => window.location.reload()}>Reload branch</button>` : nothing}
      ${this._error ? html`<p role="alert">${this._error}</p>` : nothing}
      ${!this._ready ? html`<button type="button" @click=${this.loadMetadata} ?disabled=${this._busy}>Retry branch metadata</button>` : nothing}
      ${this._syncId ? html`<div class="panel">
        <h3>Sync needs resolution</h3>
        ${session ? html`
          <p>${resolved} / ${session.entries.length} resolved</p>
          <ul>${session.entries.map((entry) => html`<li><button type="button" @click=${() => this.select(entry)}>${entry.path}</button>
            — ${entry.itemKind} · ${entry.conflictKind || 'conflict'}${entry.choice ? ` · ${entry.choice}` : ''}</li>`)}</ul>
          ${detail ? html`<h4>${detail.entry.path}</h4><div class="sides">
            ${SIDES.map((side, index) => this.renderSide(side[0].toUpperCase() + side.slice(1), detail.sides[index], detail.entry.itemKind))}
          </div>
          <button type="button" @click=${() => this.resolve('branch')} ?disabled=${this._busy || this._moved}>Keep branch</button>
          <button type="button" @click=${() => this.resolve('default')} ?disabled=${this._busy || this._moved}>Take default</button>
          <button type="button" @click=${() => this.resolve('delete')} ?disabled=${this._busy || this._moved}>Delete</button>
          ${TEXT.has(detail.entry.itemKind) ? html`<label>Edited source<textarea .value=${this._draft ?? ''}
            @input=${(event) => { this._draft = event.target.value; }} ?disabled=${this._moved}></textarea></label>
            <button type="button" @click=${() => this.resolve('edited')} ?disabled=${this._busy || this._moved || this._draft === undefined}>Use edited result</button>` : nothing}` : nothing}
          <button type="button" @click=${this.complete} ?disabled=${this._busy || this._moved || this._draft !== undefined || resolved !== session.entries.length}>Complete sync</button>
        ` : html`<button type="button" @click=${() => this.run((ctx) => this.openSession(ctx, this._syncId))} ?disabled=${this._busy}>Retry loading conflicts</button>`}
        <button type="button" @click=${() => this.cancel()} ?disabled=${this._busy}>Cancel sync</button>
        ${this._moved ? html`<button type="button" @click=${() => this.cancel(true)} ?disabled=${this._busy}>Restart sync</button>` : nothing}
      </div>` : nothing}
    `;
  }
}

customElements.define('da-branch-conflicts', DaBranchConflicts);
