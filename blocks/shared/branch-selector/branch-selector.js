import { LitElement, html, nothing } from 'da-lit';
import { parseSiteSegment } from '../content-branch-context.js';
import { createBranchingClient } from '../branching-client.js';
import { discoverBranching, defaultSourceMatchesBinding } from './context.js';
import { switchContentBranch, withBranchBarrier } from './navigation.js';
import '../branch-changes/branch-changes.js';
import '../branch-conflicts/branch-conflicts.js';

export class DaBranchSelector extends LitElement {
  static properties = {
    org: { type: String },
    site: { type: String },
    _data: { state: true },
    _error: { state: true },
    _busy: { state: true },
  };

  updated(changed) {
    if (changed.has('org') || changed.has('site')) this.load();
  }

  async load() {
    const { org } = this;
    const rawSite = this.site;
    this._data = undefined;
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

  render() {
    if (!this._data) return nothing;
    const { selected, branches, defaultBranchId } = this._data;
    return html`
      <details>
        <summary>${selected ? `Branch · ${selected}` : `Default · ${defaultBranchId}`}</summary>
        <button type="button" ?disabled=${this._busy || !selected} @click=${() => this.select(null)}>
          Default · ${defaultBranchId}
        </button>
        ${branches.map((branch) => html`<button type="button" ?disabled=${this._busy || selected === branch.id}
          @click=${() => this.select(branch.id)}>Branch · ${branch.name}</button>`)}
        <form @submit=${this.create}>
          <label>Create from Default <input name="name" maxlength="8" required></label>
          <button type="submit" ?disabled=${this._busy}>Create</button>
        </form>
      </details>
      ${selected ? html`
        <da-branch-changes .branchId=${selected} .client=${this._data.client}></da-branch-changes>
        <da-branch-conflicts .branchId=${selected} .client=${this._data.client}
          @branch-changed=${this.refreshChanges}></da-branch-conflicts>
        <slot name="toolbar"></slot>
      ` : nothing}
      ${this._error ? html`<p role="alert">${this._error}</p>` : nothing}
    `;
  }
}

customElements.define('da-branch-selector', DaBranchSelector);
