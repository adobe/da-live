import { LitElement, html, nothing } from 'da-lit';
import { BranchingError } from '../branching-client.js';
import { retirePublishedBranch, withBranchBarrier } from '../branch-selector/navigation.js';
import { lockBranchEditing, unlockBranchEditing, rememberEditorBeforeBarrier, forgetUnneededEditorSnapshot } from './editing-lock.js';
import styles from './branch-conflicts-styles.js';
import { isSingleAuthorDemo } from '../da-rs-bootstrap.js';
import '../branch-diff/branch-diff.js';

const SIDES = ['base', 'branch', 'default'];
const TEXT = new Set(['html', 'json', 'config']);
const IMAGES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);
const CHOICES = new Set(['branch', 'default', 'edited', 'delete']);
const CHOICE_LABELS = {
  branch: 'Keep branch',
  default: 'Take default',
  delete: 'Delete',
  edited: 'Use edited result',
};
const STATUS_DURATION_MS = 5000;
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
    _deleteAfterPublish: { state: true },
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
    this.shadowRoot.adoptedStyleSheets = [styles];
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

  updated() {
    if (!this.isConnected) return;
    const anchor = this.shadowRoot.querySelector('.actions').getBoundingClientRect();
    this.shadowRoot.querySelectorAll('[popover]').forEach((panel) => {
      if (panel.matches(':popover-open')) return;
      panel.style.setProperty('--branch-panel-top', `${Math.min(anchor.bottom + 8, window.innerHeight / 3)}px`);
      panel.showPopover();
    });
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
    this.showStatus();
    this._moved = false;
    this._confirm = false;
    this._deleteAfterPublish = false;
    this._retry = undefined;
    this._terminalRefresh = false;
    this._ready = false;
    this._uncertain = false;
    this._shouldUnlock = false;
  }

  showStatus(message, transient = false) {
    clearTimeout(this._statusTimer);
    this._statusTimer = undefined;
    this._status = message;
    if (transient) {
      this._statusTimer = setTimeout(() => this.showStatus(), STATUS_DURATION_MS);
    }
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
    this.showStatus('Sync needs resolution. Branch editing is locked.');
  }

  async run(operation) {
    if (this._busy) return;
    if (this._statusTimer !== undefined) this.showStatus();
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

  async result(ctx, result, deleteAfterPublish = false) {
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
        completed: 'Sync completed. You can now merge to default.',
        'nothing-to-publish': 'Nothing to merge.',
      };
      this.showStatus(messages[result.status], true);
      this._shouldUnlock = true;
      if (deleteAfterPublish && result.status === 'published') {
        try {
          const { branch } = result;
          if (branch?.id !== ctx.branchId || !revision(branch.revision) || branch.revision < 1) {
            throw new Error('Missing merged branch revision');
          }
          const remove = () => ctx.client.delete(ctx.branchId, branch.revision);
          await retirePublishedBranch(ctx.branchId, remove, { valid: ctx.valid });
          return;
        } catch (error) {
          if (ctx.valid()) {
            this.showStatus(messages.published);
            this._error = `The branch couldn’t be deleted: ${error.message}`;
          }
        }
      }
      this.dispatchEvent(new CustomEvent('branch-changed', { bubbles: true, composed: true }));
      // Reconciliation can replace Source without a collaboration invalidation.
      if (isSingleAuthorDemo() && result.status !== 'nothing-to-publish') window.location.reload();
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
            this.showStatus('Sync result unknown. Reload this branch before editing.');
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
        const { expected, key, deleteAfterPublish } = this._retry;
        const result = await this.submitPublish(ctx, expected, key, deleteAfterPublish);
        if (result) await this.result(ctx, result, deleteAfterPublish);
        return;
      }
      const deleteAfterPublish = this._deleteAfterPublish;
      rememberEditorBeforeBarrier();
      await withBranchBarrier(async () => {
        if (!ctx.valid()) throw new Error('The current location changed');
        const expected = await this.branchRevision(ctx);
        const key = crypto.randomUUID();
        const result = await this.submitPublish(ctx, expected, key, deleteAfterPublish);
        if (result) await this.result(ctx, result, deleteAfterPublish);
      });
    });
  }

  async submitPublish(ctx, expected, key, deleteAfterPublish) {
    try {
      const result = await ctx.client.publish(ctx.branchId, expected, key);
      if (!validResult(result, ['published', 'nothing-to-publish', 'needs-resolution'])) {
        throw new Error('Invalid merge response');
      }
      return result;
    } catch (error) {
      if (ctx.valid() && error instanceof BranchingError
        && error.status === 409 && error.code === 'REVISION_CHANGED') {
        this._retry = undefined;
        this._confirm = false;
        this._ready = false;
        this._terminalRefresh = true;
        this.showStatus('Branch revision changed. Review the branch and confirm a new merge.');
        lockBranchEditing();
        await this.refreshMetadata(ctx, true);
        return undefined;
      }
      // An unstructured conflict does not identify a terminal replay outcome.
      const ambiguousConflict = error instanceof BranchingError
        && error.status === 409 && !error.code;
      if (ctx.valid() && (uncertain(error) || ambiguousConflict)) {
        this._retry = { expected, key, ...(deleteAfterPublish ? { deleteAfterPublish } : {}) };
        this.showStatus('Merge result unknown. Editing is locked; retry the same request.');
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
          this.showStatus('Default moved. Restart sync; all choices must be made again.');
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
          this.showStatus('Restart pending. Reload this branch if restart fails.');
          const expected = await this.branchRevision(ctx);
          await this.result(ctx, await ctx.client.sync(ctx.branchId, expected));
        } else {
          this._shouldUnlock = true;
          this.showStatus('Sync cancelled. Branch content is unchanged.', true);
        }
      };
      if (restart) {
        rememberEditorBeforeBarrier();
        await withBranchBarrier(action);
      } else await action();
    });
  }

  renderSide(label, side) {
    if (side.state === 'absent') return html`<section><h4>${label}</h4><p>Absent</p></section>`;
    return html`<section><h4>${label}</h4>
      <p>Type: ${side.type} · Size: ${side.blob.size} bytes · Hash: ${side.hash || 'Unavailable'}</p>
      ${side.preview ? html`<img src=${side.preview} alt=${`${label} preview`}>` : nothing}</section>`;
  }

  renderComparison({ entry, sides }) {
    if (TEXT.has(entry.itemKind)) {
      const [base, branch, defaultSide] = sides;
      return html`<da-branch-diff .itemKind=${entry.itemKind}
        .base=${base} .branch=${branch} .defaultSide=${defaultSide}></da-branch-diff>`;
    }
    return html`<div class="sides">
      ${SIDES.map((side, index) => this.renderSide(side[0].toUpperCase() + side.slice(1), sides[index]))}
    </div>`;
  }

  renderFeedback() {
    return html`
      ${this._status ? html`<p role="status">${this._status}</p>` : nothing}
      ${this._error ? html`<p class="error" role="alert">${this._error}</p>` : nothing}
      ${this._retry ? html`<button class="primary" type="button"
        @click=${this.publish} ?disabled=${this._busy}>Retry merge</button>` : nothing}
      ${this._uncertain ? html`<button type="button" @click=${() => window.location.reload()}>Reload branch</button>` : nothing}
      ${!this._ready && this._error ? html`<button type="button" @click=${this.loadMetadata}
        ?disabled=${this._busy}>Retry branch metadata</button>` : nothing}
    `;
  }

  renderNotice() {
    if (!this._status && !this._error && !this._retry && !this._uncertain) return nothing;
    const dismissible = !this._retry && !this._uncertain && this._ready;
    return html`<div class="notice" popover="manual">
      ${this.renderFeedback()}
      ${dismissible ? html`<button class="dismiss" type="button" aria-label="Dismiss branch notification"
        @click=${() => { this.showStatus(); this._error = undefined; }}>×</button>` : nothing}
    </div>`;
  }

  renderConfirmation() {
    return html`<div class="panel confirmation" popover="manual" role="dialog" aria-labelledby="publish-title"
      @keydown=${(event) => {
    if (event.key === 'Escape' && !this._busy) {
      this._confirm = false;
      this.shadowRoot.querySelector('[part~="publish-action"]').focus();
    }
  }}>
      <h3 id="publish-title">Merge to default</h3>
      <p class="description">Merge all branch changes to default? This does not publish to AEM preview or live.</p>
      <label class="publish-delete"><input type="checkbox" .checked=${Boolean(this._deleteAfterPublish)}
        ?disabled=${this._busy} @change=${({ target }) => { this._deleteAfterPublish = target.checked; }}>
        Delete this branch after merging
      </label>
      ${this._deleteAfterPublish ? html`<p class="description">Close other editors on this branch first.
        After merging, you’ll return to Default and this branch will be deleted.</p>` : nothing}
      ${this.renderFeedback()}
      <footer>
        <button type="button" @click=${() => { this._confirm = false; }} ?disabled=${this._busy}>Cancel</button>
        <button class="primary" type="button" @click=${this.publish} ?disabled=${this._busy}>Confirm merge to default</button>
      </footer>
    </div>`;
  }

  renderChoice(choice, savedChoice, disabled = false) {
    return html`<button class="resolution-choice" type="button" aria-pressed=${choice === savedChoice}
      @click=${() => this.resolve(choice)} ?disabled=${this._busy || this._moved || disabled}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>
      ${CHOICE_LABELS[choice]}
    </button>`;
  }

  renderSession() {
    const session = this._session;
    const detail = this._detail;
    const activeEntry = session?.entries.find(({ entryId }) => entryId === detail?.entry.entryId);
    const savedChoice = activeEntry?.choice;
    const resolved = session?.entries.filter((entry) => entry.choice).length || 0;
    return html`<div class="panel session" popover="manual" role="dialog" aria-labelledby="sync-title">
      <h3 id="sync-title">Sync needs resolution</h3>
      ${this.renderFeedback()}
      ${session ? html`
        <p class="progress">${resolved} / ${session.entries.length} resolved</p>
        <ul class="conflict-list">${session.entries.map((entry) => html`<li>
          <button type="button" aria-pressed=${detail?.entry.entryId === entry.entryId}
            @click=${() => this.select(entry)}>${entry.path}</button>
          <span>${entry.itemKind} · ${entry.conflictKind || 'conflict'}${entry.choice ? ` · ${CHOICE_LABELS[entry.choice]}` : ''}</span>
        </li>`)}</ul>
        ${detail ? html`<h4>${detail.entry.path}</h4>${this.renderComparison(detail)}
        <div class="choices" role="group" aria-label="Resolution options">
          ${['branch', 'default', 'delete'].map((choice) => this.renderChoice(choice, savedChoice))}
        </div>
        ${TEXT.has(detail.entry.itemKind) ? html`<label>Edited source<textarea .value=${this._draft ?? ''}
          @input=${(event) => { this._draft = event.target.value; }} ?disabled=${this._moved}></textarea></label>
          ${this.renderChoice('edited', savedChoice, this._draft === undefined)}` : nothing}` : nothing}
      ` : html`<button type="button" @click=${() => this.run((ctx) => this.openSession(ctx, this._syncId))}
        ?disabled=${this._busy}>Retry loading conflicts</button>`}
      <footer>
        <button type="button" @click=${() => this.cancel()} ?disabled=${this._busy}>Cancel sync</button>
        ${this._moved ? html`<button class="primary" type="button" @click=${() => this.cancel(true)} ?disabled=${this._busy}>Restart sync</button>` : nothing}
        ${session ? html`<button class="primary" type="button" @click=${this.complete}
          ?disabled=${this._busy || this._moved || this._draft !== undefined || resolved !== session.entries.length}>Complete sync</button>` : nothing}
      </footer>
    </div>`;
  }

  render() {
    const disabled = !this._ready || this._busy || !!this._syncId
      || !!this._retry || this._uncertain;
    let overlay;
    if (this._syncId) overlay = this.renderSession();
    else if (this._confirm && !this._retry) overlay = this.renderConfirmation();
    else overlay = this.renderNotice();
    return html`
      <div class="actions">
        <button type="button" part="action" @click=${this.sync} ?disabled=${disabled}>
          <svg part="action-icon" width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M16 8a6 6 0 0 0-10-3L4 7m0-4v4h4m-4 5a6 6 0 0 0 10 3l2-2m0 4v-4h-4"/></svg>
          Sync from default
        </button>
        <button type="button" part="action publish-action" @click=${() => {
    this._deleteAfterPublish = false;
    this._confirm = true;
  }}
          aria-haspopup="dialog" ?disabled=${disabled}>
          <svg part="action-icon" width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 13V4m-4 4 4-4 4 4M4 12v4h12v-4"/></svg>
          Merge to default
        </button>
      </div>
      ${overlay}
    `;
  }
}

customElements.define('da-branch-conflicts', DaBranchConflicts);
