import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import getSheet from '../../shared/sheet.js';
import { loadOrgConfig, listSites, mutatePermissions } from '../api.js';
import {
  buildSlots, siteNames, parseMembers, addMembers, removeMember, scopeLabel, filterSlots,
  folderRulePath, LEVEL_LABEL,
} from '../utils.js';

await import(`${getNx()}/blocks/shared/breadcrumb/breadcrumb.js`);
await import(`${getNx()}/blocks/shared/picker/picker.js`);
await import(`${getNx()}/blocks/shared/search/search.js`);
await import(`${getNx()}/blocks/shared/dialog/dialog.js`);
await import('../da-permissions-cards/da-permissions-cards.js');
await import('../folder-picker/folder-picker.js');

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

const [form, buttons, style] = await Promise.all([
  getSheet(`${getNx2()}/styles/form.css`),
  getSheet(`${getNx2()}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);

const INFO_DISMISSED_KEY = 'da-permissions-info-dismissed';
const DOCS_URL = 'https://docs.da.live/administrators/guides/permissions';
const CLOSE_ICON_SRC = '/img/icons/s2-icon-close-20-n.svg';

/**
 * Container component for the permissions block. Routes on `org`/`site`
 * (set by `permissions.js` on every hash change, same element reused), loads
 * the org config, and renders the A1 cards — or the empty/loading/error
 * states in its place.
 */
class DaPermissions extends LitElement {
  static properties = {
    org: { attribute: false },
    site: { attribute: false },
    _status: { state: true },
    _rules: { state: true },
    _httpStatus: { state: true },
    _sites: { state: true },
    _expanded: { state: true },
    _query: { state: true },
    _readOnly: { state: true },
    _busy: { state: true },
    _infoDismissed: { state: true },
    _adding: { state: true },
    _confirmRemove: { state: true },
    _pendingFolder: { state: true },
    _folderDialogOpen: { state: true },
  };

  constructor() {
    super();
    this.org = null;
    this.site = null;
    this._status = 'empty';
    this._rules = [];
    this._httpStatus = null;
    this._sites = [];
    this._expanded = new Set();
    this._readOnly = false;
    this._busy = false;
    this._query = '';
    this._infoDismissed = localStorage.getItem(INFO_DISMISSED_KEY) === 'true';
    this._adding = null;
    this._confirmRemove = null;
    this._pendingFolder = null;
    this._folderDialogOpen = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [form, buttons, style];
  }

  willUpdate(changed) {
    if (changed.has('org') && this.org !== changed.get('org')) {
      this._expanded = new Set();
      this._readOnly = false;
      this._busy = false;
      this._adding = null;
      this._confirmRemove = null;
      this._query = '';
      this._pendingFolder = null;
      this._folderDialogOpen = false;
      this._load();
    } else if (changed.has('site') && this.site !== changed.get('site')) {
      this._expanded = new Set();
      this._query = '';
      this._pendingFolder = null;
      this._folderDialogOpen = false;
      this._adding = null;
      this._confirmRemove = null;
    }
  }

  async _load() {
    const { org } = this;
    if (!org) {
      this._status = 'empty';
      this._rules = [];
      this._sites = [];
      return;
    }
    this._status = 'loading';
    const [configResult, sites] = await Promise.all([
      loadOrgConfig(org),
      listSites(org),
    ]);
    // The org changed again while this load was in flight — drop this result.
    if (this.org !== org) return;
    this._status = configResult.status;
    this._rules = configResult.rules;
    this._httpStatus = configResult.httpStatus ?? null;
    this._sites = sites;
  }

  get _slots() {
    return buildSlots(this._rules, this.site, this._pendingFolder);
  }

  get _filteredSlots() {
    return filterSlots(this._slots, this._query);
  }

  get _cardsExpanded() {
    if (!this._query.trim()) return this._expanded;
    return new Set(this._filteredSlots.map((slot) => slot.path));
  }

  get _siteNames() {
    return siteNames(this._sites, this._rules);
  }

  get _editable() {
    return this._status === 'ok' && !this._readOnly;
  }

  _onFilterInput({ target }) {
    this._query = target.value;
  }

  _onToggle({ detail }) {
    const next = new Set(this._expanded);
    if (next.has(detail.path)) next.delete(detail.path);
    else next.add(detail.path);
    this._expanded = next;
  }

  _onAddOpen({ detail }) {
    this._adding = { path: detail.path, level: detail.level };
  }

  _onAddCancel() {
    this._adding = null;
  }

  async _onAdd({ detail }) {
    const { path, level, value } = detail;
    this._adding = null;
    const who = parseMembers(value);
    if (who.length === 0) return;

    const slot = this._slots.find((s) => s.path === path);
    const currentLower = new Set((slot?.[level] || []).map((m) => m.toLowerCase()));
    const allDuplicate = who.every((w) => currentLower.has(w.toLowerCase()));
    if (allDuplicate) {
      const { showToast, VARIANT_WARNING } = await import(`${getNx2()}/blocks/shared/toast/toast.js`);
      showToast({ text: `Already has access: ${who.join(', ')}`, variant: VARIANT_WARNING });
      return;
    }

    await this._mutate((config) => addMembers(config, path, level, who), path);
  }

  _onRemoveRequest({ detail }) {
    this._confirmRemove = { path: detail.path, level: detail.level, who: detail.who };
  }

  _cancelRemove() {
    this._confirmRemove = null;
  }

  async _confirmRemoveNow() {
    const { path, level, who } = this._confirmRemove;
    this._confirmRemove = null;
    await this._mutate((config) => removeMember(config, path, level, who), path);
  }

  // Captures `org` before the request and drops the result if the container
  // has since routed to a different org (consistent with `_load`'s guard).
  // All rules are org-wide, so a site-only change within the same org still
  // applies the saved result. `path` is the rule path the mutation targeted,
  // used to clear a pending folder once its first member saves successfully.
  async _mutate(mutateFn, path = null) {
    const { org } = this;
    this._busy = true;
    const result = await mutatePermissions(org, mutateFn);
    if (this.org !== org) return;
    this._busy = false;

    if (result.ok) {
      this._rules = result.rules;
      if (this._pendingFolder && path === folderRulePath(this.site, this._pendingFolder)) {
        this._pendingFolder = null;
      }
      return;
    }
    if (result.status === 401 || result.status === 403) {
      this._readOnly = true;
      return;
    }
    if (result.status === 409 && result.error === 'no-sheet') {
      this._status = 'no-sheet';
      return;
    }
    const { showToast, VARIANT_ERROR } = await import(`${getNx2()}/blocks/shared/toast/toast.js`);
    showToast({ text: 'Could not save changes.', variant: VARIANT_ERROR });
  }

  _onPickerChange({ detail }) {
    window.location.hash = detail.value ? `/${this.org}/${detail.value}` : `/${this.org}`;
  }

  _onOrgSubmit(e) {
    e.preventDefault();
    const value = new FormData(e.currentTarget).get('org')?.toString().trim();
    if (!value) return;
    window.location.hash = `/${value}`;
  }

  _onOpenFolderDialog() {
    this._folderDialogOpen = true;
  }

  _onFolderSelect({ detail }) {
    this._folderDialogOpen = false;
    this._pendingFolder = detail.folder;
    this._query = '';
    const path = folderRulePath(this.site, detail.folder);
    const next = new Set(this._expanded);
    next.add(path);
    this._expanded = next;
    this._adding = { path, level: 'read' };
  }

  _onFolderCancel() {
    this._folderDialogOpen = false;
  }

  _dismissInfo() {
    this._infoDismissed = true;
    localStorage.setItem(INFO_DISMISSED_KEY, 'true');
  }

  _renderOrgForm() {
    return html`
      <form class="permissions-org-form" @submit=${(e) => this._onOrgSubmit(e)}>
        <div class="nx-form-field">
          <label for="permissions-org-input">Organization</label>
          <input id="permissions-org-input" class="nx-input" name="org" type="text" placeholder="Org name" required>
        </div>
        <button type="submit" class="nx-btn-accent">Open</button>
      </form>`;
  }

  _renderInfoNote() {
    if (this._infoDismissed) return nothing;
    return html`
      <div class="permissions-info-note" role="note">
        <p>
          <strong>Read</strong> = view &middot; <strong>Write</strong> = create/edit/delete &middot;
          <strong>None</strong> = deny &middot; emails or IMS group IDs &middot;
          <a href=${DOCS_URL} target="_blank" rel="noopener">Docs</a>
        </p>
        <p>Changes save directly to the org config. If someone else saves at the same time, the last save wins.</p>
        <button type="button" class="nx-action-btn-icon" aria-label="Dismiss" @click=${() => this._dismissInfo()}>
          <svg aria-hidden="true" viewBox="0 0 20 20"><use href="${CLOSE_ICON_SRC}#icon"></use></svg>
        </button>
      </div>`;
  }

  _renderHeader() {
    const pathSegments = this.site ? [this.org, this.site] : [this.org];
    const pickerItems = [
      { value: '', label: 'All sites' },
      { divider: true },
      ...this._siteNames.map((name) => ({ value: name, label: name })),
    ];
    return html`
      <div class="permissions-header">
        <nx-breadcrumb .pathSegments=${pathSegments}></nx-breadcrumb>
        <div class="permissions-header-actions">
          <nx-search
            variant="field"
            placeholder="Filter by person or folder…"
            .value=${this._query}
            @input=${(e) => this._onFilterInput(e)}
          ></nx-search>
          <nx-picker
            variant="field"
            .items=${pickerItems}
            .value=${this.site ?? ''}
            @change=${(e) => this._onPickerChange(e)}
          ></nx-picker>
        </div>
      </div>`;
  }

  _renderBody() {
    if (this._status === 'loading') {
      return html`<div class="nx-loading-spinner" role="status" aria-label="Loading"></div>`;
    }
    if (this._status === 'no-access') {
      return html`<p class="permissions-message">You don't have admin access to this org.</p>`;
    }
    if (this._status === 'error') {
      return html`<p class="permissions-message">Could not load permissions (${this._httpStatus}).</p>`;
    }
    if (this._status === 'no-sheet') {
      return html`
        <p class="permissions-message">
          This org has no permissions sheet yet — set one up in the org config.
          <a href="/config#/${this.org}/">Open org config</a>
        </p>`;
    }
    const filtered = this._filteredSlots;
    const trimmedQuery = this._query.trim();
    if (trimmedQuery && filtered.length === 0) {
      return html`
        ${this._readOnly ? html`<p class="permissions-message">You have read-only access to this configuration.</p>` : nothing}
        <p class="permissions-message">No scopes match "${trimmedQuery}"</p>
        ${this._renderAddFolderButton()}
        ${this._renderRemoveDialog()}
        ${this._renderFolderDialog()}`;
    }
    return html`
      ${this._readOnly ? html`<p class="permissions-message">You have read-only access to this configuration.</p>` : nothing}
      <da-permissions-cards
        .slots=${filtered}
        .org=${this.org}
        .expanded=${this._cardsExpanded}
        .editable=${this._editable}
        .busy=${this._busy}
        .adding=${this._adding}
        .filtering=${!!trimmedQuery}
        @permissions-toggle=${(e) => this._onToggle(e)}
        @permissions-add-open=${(e) => this._onAddOpen(e)}
        @permissions-add-cancel=${() => this._onAddCancel()}
        @permissions-add=${(e) => this._onAdd(e)}
        @permissions-remove=${(e) => this._onRemoveRequest(e)}
      ></da-permissions-cards>
      ${this._renderAddFolderButton()}
      ${this._renderRemoveDialog()}
      ${this._renderFolderDialog()}`;
  }

  _renderAddFolderButton() {
    if (!this.site || !this._editable) return nothing;
    return html`
      <div class="permissions-folder-action">
        <button type="button" class="nx-action-btn" @click=${() => this._onOpenFolderDialog()}>
          + Add folder permission
        </button>
      </div>`;
  }

  _renderFolderDialog() {
    if (!this._folderDialogOpen) return nothing;
    return html`
      <nx-dialog title="Add folder permission" @close=${() => this._onFolderCancel()}>
        <da-folder-picker
          .org=${this.org}
          .site=${this.site}
          @folder-select=${(e) => this._onFolderSelect(e)}
          @folder-cancel=${() => this._onFolderCancel()}
        ></da-folder-picker>
      </nx-dialog>`;
  }

  _renderRemoveDialog() {
    if (!this._confirmRemove) return nothing;
    const { path, level, who } = this._confirmRemove;
    return html`
      <nx-dialog title="Remove member" @close=${() => this._cancelRemove()}>
        <p>Remove ${who} from ${scopeLabel(path, this.site)} · ${LEVEL_LABEL[level]}?</p>
        <button type="button" slot="actions" class="nx-action-btn" @click=${() => this._cancelRemove()}>Cancel</button>
        <button type="button" slot="actions" class="nx-btn-primary" @click=${() => this._confirmRemoveNow()}>Remove</button>
      </nx-dialog>`;
  }

  render() {
    if (!this.org) {
      return html`<div class="permissions-shell">${this._renderOrgForm()}</div>`;
    }
    return html`
      <div class="permissions-shell">
        ${this._renderHeader()}
        <h2 class="permissions-title">Permissions</h2>
        ${this._renderInfoNote()}
        ${this._renderBody()}
      </div>`;
  }
}

if (!customElements.get('da-permissions')) {
  customElements.define('da-permissions', DaPermissions);
}

export default DaPermissions;
