import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2, getNx2Api } from '../../../scripts/utils.js';
import getSheet from '../../shared/sheet.js';
import {
  buildSlots, siteNames, parseMembers, addMembers, removeMember, scopeLabel, filterSlots,
  folderRulePath, parseFolderPath, hasPermissionsSheet, LEVEL_LABEL,
} from '../utils.js';

await import(`${getNx()}/blocks/shared/picker/picker.js`);
await import(`${getNx()}/blocks/shared/search/search.js`);
await import(`${getNx()}/blocks/shared/dialog/dialog.js`);
await import('../da-permissions-cards/da-permissions-cards.js');

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

const [form, buttons, spinner, style] = await Promise.all([
  getSheet(`${getNx2()}/styles/form.css`),
  getSheet(`${getNx2()}/styles/buttons.css`),
  getSheet(`${getNx2()}/styles/spinner.css`),
  loadStyle(import.meta.url),
]);

async function readOrgConfig(org) {
  const { config, asJson } = await getNx2Api();
  try {
    return await asJson(config.get({ org, cachebust: true }));
  } catch (e) {
    return { ok: false, data: null, status: 0, error: e.message };
  }
}

export async function loadOrgConfig(org) {
  const { ok, data, status, error } = await readOrgConfig(org);
  if (status === 401 || status === 403 || status === 404) {
    return { status: 'no-access', rules: [] };
  }
  if (!ok || error || !data) {
    return { status: 'error', rules: [], httpStatus: status };
  }

  if (!hasPermissionsSheet(data)) {
    return { status: 'no-sheet', rules: [] };
  }
  return { status: 'ok', rules: data.permissions.data };
}

// Last write wins: da-admin's /config ignores If-Match, so re-read right before saving
// to keep the conflict window to one round trip.
export async function mutatePermissions(org, mutate) {
  const { ok, data, status, error } = await readOrgConfig(org);
  if (!ok) {
    return status ? { ok: false, status } : { ok: false, status: 0, error };
  }
  if (error || !data) {
    return { ok: false, status, error: 'parse-failed' };
  }

  if (!hasPermissionsSheet(data)) {
    return { ok: false, status: 409, error: 'no-sheet' };
  }

  const { config: next, changed } = mutate(data);
  if (!changed) {
    return { ok: true, status: 200, rules: next.permissions.data };
  }

  const { config } = await getNx2Api();
  let saveResp;
  try {
    saveResp = await config.save({ org, body: JSON.stringify(next) });
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
  if (!saveResp.ok) {
    return { ok: false, status: saveResp.status };
  }
  return { ok: true, status: saveResp.status, rules: next.permissions.data };
}

const DOCS_URL = 'https://www.aem.live/docs/ew/administering/permissions';

class DaPermissions extends LitElement {
  static properties = {
    org: { attribute: false },
    site: { attribute: false },
    _status: { state: true },
    _rules: { state: true },
    _httpStatus: { state: true },
    _sites: { state: true },
    _query: { state: true },
    _readOnly: { state: true },
    _busy: { state: true },
    _adding: { state: true },
    _confirmRemove: { state: true },
    _pendingFolder: { state: true },
    _folderDialogOpen: { state: true },
    _folderError: { state: true },
  };

  constructor() {
    super();
    this.org = null;
    this.site = null;
    this._status = null;
    this._rules = [];
    this._httpStatus = null;
    this._sites = [];
    this._readOnly = false;
    this._busy = false;
    this._query = '';
    this._adding = null;
    this._confirmRemove = null;
    this._pendingFolder = null;
    this._folderDialogOpen = false;
    this._folderError = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [form, buttons, spinner, style];
  }

  willUpdate(changed) {
    const orgChanged = changed.has('org') && this.org !== changed.get('org');
    const siteChanged = changed.has('site') && this.site !== changed.get('site');
    if (!orgChanged && !siteChanged) return;

    this._query = '';
    this._pendingFolder = null;
    this._folderDialogOpen = false;
    this._adding = null;
    this._confirmRemove = null;
    if (orgChanged) {
      this._readOnly = false;
      this._busy = false;
      this._load();
    }
  }

  async _load() {
    const { org } = this;
    if (!org) {
      this._rules = [];
      this._sites = [];
      return;
    }
    this._status = 'loading';
    const { source } = await getNx2Api();
    const [configResult, list] = await Promise.all([
      loadOrgConfig(org),
      source.list({ org }).catch(() => ({})),
    ]);
    // The org changed again while this load was in flight — drop this result.
    if (this.org !== org) return;
    this._status = configResult.status;
    this._rules = configResult.rules;
    this._httpStatus = configResult.httpStatus ?? null;
    this._sites = list.ok ? list.items.filter((item) => !item.ext).map((item) => item.name) : [];
  }

  get _slots() {
    return buildSlots(this._rules, this.site, this._pendingFolder);
  }

  get _filteredSlots() {
    return filterSlots(this._slots, this._query);
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

  // Drop the result if the org changed mid-save; a site change still applies (rules are org-wide).
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
    this._folderError = null;
    this._folderDialogOpen = true;
  }

  _onFolderSubmit(e) {
    e?.preventDefault();
    const input = this.shadowRoot.querySelector('.folder-path-input');
    const result = parseFolderPath(input?.value);
    if (result.error) {
      this._folderError = result.error;
      return;
    }
    this._folderError = null;
    this._folderDialogOpen = false;
    this._pendingFolder = result.folder;
    this._query = '';
    this._adding = { path: folderRulePath(this.site, result.folder), level: 'read' };
  }

  _onFolderCancel() {
    this._folderDialogOpen = false;
  }

  _renderOrgForm() {
    return html`
      <div class="permissions-info-note" role="note">
        <form class="permissions-org-form" @submit=${(e) => this._onOrgSubmit(e)}>
          <p>No organization in the URL. Enter one to manage its permissions.</p>
          <input
            class="nx-input"
            name="org"
            type="text"
            placeholder="Organization"
            aria-label="Organization"
            autocomplete="off"
            required
          >
          <button type="submit" class="nx-form-btn-secondary">Open</button>
        </form>
      </div>`;
  }

  _renderInfoNote() {
    return html`
      <div class="permissions-info-note" role="note">
        <p>
          <strong>Write</strong> = view, create, edit and delete &middot;
          <strong>Read</strong> = view &middot;
          <strong>None</strong> = no access &middot;
          emails or IMS group IDs &middot;
          <a href=${DOCS_URL} target="_blank" rel="noopener">Docs</a>
        </p>
        <p>Changes save directly to the org config. If someone else saves at the same time, the last save wins.</p>
      </div>`;
  }

  _renderHeader() {
    const pickerItems = [
      { value: '', label: 'Org Permissions' },
      { divider: true },
      ...this._siteNames.map((name) => ({ value: name, label: name })),
    ];
    return html`
      <div class="permissions-header">
        <div class="permissions-header-actions">
          <nx-search
            variant="field"
            size="m"
            placeholder="Filter by person or folder…"
            .value=${this._query}
            @input=${(e) => this._onFilterInput(e)}
          ></nx-search>
          <div class="permissions-site-picker">
            <nx-picker
              variant="field"
              size="m"
              .items=${pickerItems}
              .value=${this.site ?? ''}
              @change=${(e) => this._onPickerChange(e)}
            ></nx-picker>
          </div>
        </div>
      </div>`;
  }

  _renderBody() {
    if (this._status === 'loading') {
      return html`
        <div class="permissions-loading" role="status">
          <span class="nx-loading-spinner" aria-hidden="true"></span>
          <span>Loading permissions for ${this.org}…</span>
        </div>`;
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
    const content = trimmedQuery && filtered.length === 0
      ? html`<p class="permissions-message">No scopes match "${trimmedQuery}"</p>`
      : html`<da-permissions-cards
        .slots=${filtered}
        .org=${this.org}
        .scopeName=${this.site ?? this.org}
        .editable=${this._editable}
        .busy=${this._busy}
        .adding=${this._adding}
        .canAddFolder=${!!this.site && this._editable && !trimmedQuery}
        .query=${trimmedQuery}
        @permissions-add-folder=${() => this._onOpenFolderDialog()}
        @permissions-add-open=${(e) => this._onAddOpen(e)}
        @permissions-add-cancel=${() => this._onAddCancel()}
        @permissions-add=${(e) => this._onAdd(e)}
        @permissions-remove=${(e) => this._onRemoveRequest(e)}
      ></da-permissions-cards>`;
    return html`
      ${this._readOnly ? html`<p class="permissions-message">You have read-only access to this configuration.</p>` : nothing}
      ${content}
      ${this._renderRemoveDialog()}
      ${this._renderFolderDialog()}`;
  }

  _renderFolderDialog() {
    if (!this._folderDialogOpen) return nothing;
    const error = this._folderError;
    return html`
      <nx-dialog title="Add folder permission" @close=${() => this._onFolderCancel()}>
        <form class="folder-add-form" @submit=${(e) => this._onFolderSubmit(e)}>
          <div class="nx-form-field ${error ? 'nx-field-error' : ''}">
            <label for="permissions-folder-path">Folder path</label>
            <input
              id="permissions-folder-path"
              class="folder-path-input nx-input"
              type="text"
              placeholder="/blog/drafts"
              autocomplete="off"
              autofocus
              aria-invalid=${error ? 'true' : 'false'}
            >
            ${error ? html`<p class="nx-input-error-msg" role="alert">${error}</p>` : nothing}
          </div>
        </form>
        <button type="button" slot="actions" class="nx-form-btn-secondary" @click=${() => this._onFolderCancel()}>Cancel</button>
        <button type="button" slot="actions" class="folder-add-submit nx-form-btn-primary" @click=${() => this._onFolderSubmit()}>Add</button>
      </nx-dialog>`;
  }

  _renderRemoveDialog() {
    if (!this._confirmRemove) return nothing;
    const { path, level, who } = this._confirmRemove;
    return html`
      <nx-dialog title="Remove member" @close=${() => this._cancelRemove()}>
        <p>Remove ${who} from ${scopeLabel(path, this.site)} · ${LEVEL_LABEL[level]}?</p>
        <button type="button" slot="actions" class="nx-form-btn-secondary" @click=${() => this._cancelRemove()}>Cancel</button>
        <button type="button" slot="actions" class="nx-form-btn-primary" @click=${() => this._confirmRemoveNow()}>Remove</button>
      </nx-dialog>`;
  }

  render() {
    if (!this.org) {
      return html`
        <div class="permissions-shell">
          <h2 class="permissions-title">Permissions</h2>
          ${this._renderOrgForm()}
        </div>`;
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
