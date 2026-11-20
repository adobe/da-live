import { LitElement, html, nothing } from 'da-lit';
import { parseSiteSegment } from '../content-branch-context.js';
import { createBranchingClient } from '../branching-client.js';
import { discoverBranching, defaultSourceMatchesBinding } from './context.js';
import { switchContentBranch, withBranchBarrier } from './navigation.js';
import styles from './branch-selector-styles.js';
import '../branch-changes/branch-changes.js';
import '../branch-conflicts/branch-conflicts.js';

export class DaBranchSelector extends LitElement {
  static properties = {
    org: { type: String },
    site: { type: String },
    _data: { state: true },
    _error: { state: true },
    _busy: { state: true },
    _open: { state: true },
    _deleteTarget: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  updated(changed) {
    if (changed.has('org') || changed.has('site')) this.load();
  }

  async load() {
    const { org } = this;
    const rawSite = this.site;
    this._data = undefined;
    this._open = false;
    this._error = undefined;
    this._deleteTarget = undefined;
    if (!org || !rawSite) return;
    let parsed;
    try { parsed = parseSiteSegment(rawSite); } catch {
      return;
    }
    try {
      if (!parsed.branch && !await defaultSourceMatchesBinding(org, parsed.site)) return;
      const support = await discoverBranching(org, parsed.site);
      if (support.status !== 'available') return;
      const client = createBranchingClient({ org, site: parsed.site });
      const list = await client.list();
      if (this.org !== org || this.site !== rawSite) return;
      if (list.defaultBranchId !== support.capabilities.defaultBranchId
        || !Array.isArray(list.branches)) return;
      this._data = { ...list, selected: parsed.branch, client };
    } catch { /* Optional on Default; explicit access is validated by ingress. */ }
  }

  async select(branch) {
    this._busy = true;
    this._error = undefined;
    try { await switchContentBranch(branch); } catch (error) {
      this._error = error.message;
    }
    this._busy = false;
  }

  async create(event) {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get('name');
    if (!/^[a-z0-9]{1,8}$/.test(name) || name === 'main') {
      this._error = 'Use 1–8 lowercase letters or digits, except main.';
      return;
    }
    this._busy = true;
    this._error = undefined;
    const originalHash = window.location.hash;
    try {
      await withBranchBarrier(async () => {
        if (window.location.hash !== originalHash) throw new Error('The current location changed');
        const result = await this._data.client.create(name);
        const branch = result?.branch;
        if (branch?.id !== name) throw new Error('Invalid branch creation response');
        await switchContentBranch(branch.id);
      }, { keepInertOnSuccess: true });
    } catch (error) {
      this._error = error.message;
    }
    this._busy = false;
  }

  refreshChanges() {
    const changes = this.shadowRoot?.querySelector('da-branch-changes');
    changes?.refreshIfOpen();
  }

  async deleteBranch() {
    if (this._busy || !this._deleteTarget) return;
    const data = this._data;
    const { id } = this._deleteTarget;
    const { client, selected } = data;
    if (id === selected) return;
    const { href } = window.location;
    const valid = () => this.isConnected && this._data === data && window.location.href === href;
    this._busy = true;
    this._error = undefined;
    try {
      const branch = await client.get(id);
      if (!valid()) return;
      if (branch?.id !== id || !Number.isSafeInteger(branch.revision) || branch.revision < 1) {
        throw new Error('Invalid branch revision');
      }
      if (branch.activeSyncId) throw new Error('Resolve or cancel the active sync before deleting.');
      await client.delete(id, branch.revision);
      if (valid()) {
        const branches = data.branches.filter((candidate) => candidate.id !== id);
        this._data = { ...data, branches };
        this._deleteTarget = undefined;
      }
    } catch (error) {
      if (valid()) this._error = error.message || 'Could not delete the branch.';
    } finally {
      this._busy = false;
    }
  }

  positionMenu({ currentTarget }) {
    const menu = this.shadowRoot.getElementById('branch-options');
    const { top, bottom, right } = currentTarget.getBoundingClientRect();
    const gap = 8;
    const width = Math.min(288, window.innerWidth - 2 * gap);
    const left = Math.max(gap, Math.min(right - width, window.innerWidth - width - gap));
    const below = window.innerHeight - bottom;
    const showAbove = below < 280 && top > below;
    menu.style.setProperty('--branch-left', `${left}px`);
    menu.style.setProperty('--branch-top', showAbove ? 'auto' : `${bottom + gap / 2}px`);
    menu.style.setProperty('--branch-bottom', showAbove ? `${window.innerHeight - top + gap / 2}px` : 'auto');
    menu.style.setProperty('--branch-max-height', `${Math.max(0, (showAbove ? top : below) - 2 * gap)}px`);
  }

  render() {
    if (!this._data) return nothing;
    const { selected, branches, defaultBranchId } = this._data;
    const options = [
      { id: null, name: `Default · ${defaultBranchId}` },
      ...branches.map((branch) => ({ id: branch.id, name: `Branch · ${branch.name}`, branch })),
    ];
    return html`
      <button class="branch-trigger" type="button" popovertarget="branch-options"
        aria-haspopup="dialog" aria-expanded=${Boolean(this._open)}
        ?data-branch=${Boolean(selected)} @click=${this.positionMenu}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="6" cy="5" r="2"/><circle cx="6" cy="15" r="2"/><circle cx="14" cy="5" r="2"/>
          <path d="M6 7v6m8-6v1a3 3 0 0 1-3 3H6"/>
        </svg>
        <span>${selected ? `Branch · ${selected}` : `Default · ${defaultBranchId}`}</span>
        <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
      </button>
      <section id="branch-options" popover role="dialog" aria-label="Content branches"
        @toggle=${({ newState }) => {
    this._open = newState === 'open';
    if (!this._open && !this._busy) this._deleteTarget = undefined;
  }}>
        <h2>Content branches</h2>
        <div class="branch-list">
          ${options.map(({ id, name, branch }) => html`<div class="branch-row">
            <button type="button" class="branch-option" aria-current=${selected === id ? 'true' : nothing}
              ?disabled=${this._busy || selected === id} @click=${() => this.select(id)}>
              <span>${name}</span>
              ${selected === id ? html`<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>` : nothing}
            </button>
            ${branch && selected !== id ? html`<button type="button" class="delete-option" aria-label=${`Delete branch ${branch.name}`}
              title=${`Delete branch ${branch.name}`} ?disabled=${this._busy} @click=${() => {
    this._deleteTarget = branch;
    this._error = undefined;
  }}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5h12M8 5V3h4v2M6 5l1 12h6l1-12m-5 3v6m2-6v6"/></svg>
            </button>` : nothing}
          </div>`)}
        </div>
        ${this._deleteTarget ? html`<div class="delete-confirmation" role="group" aria-label="Confirm branch deletion">
          <strong>Delete ${this._deleteTarget.name}?</strong>
          <p>Unpublished changes will be lost. Close other editors on this branch before deleting.</p>
          <div class="delete-actions">
            <button type="button" ?disabled=${this._busy} @click=${() => { this._deleteTarget = undefined; }}>Cancel</button>
            <button type="button" class="danger" ?disabled=${this._busy} @click=${this.deleteBranch}>Delete branch</button>
          </div>
        </div>` : nothing}
        <form @submit=${this.create}>
          <label for="branch-name">Create from Default</label>
          <div class="branch-create">
            <input id="branch-name" name="name" placeholder="Branch name" maxlength="8" required>
            <button type="submit" ?disabled=${this._busy}>Create</button>
          </div>
        </form>
        ${this._error ? html`<p role="alert">${this._error}</p>` : nothing}
      </section>
      ${selected ? html`<div class="branch-actions">
        <da-branch-changes .branchId=${selected} .client=${this._data.client}></da-branch-changes>
        <da-branch-conflicts .branchId=${selected} .client=${this._data.client}
          @branch-changed=${this.refreshChanges}></da-branch-conflicts>
        <slot name="toolbar"></slot>
      </div>` : nothing}
    `;
  }
}

customElements.define('da-branch-selector', DaBranchSelector);
