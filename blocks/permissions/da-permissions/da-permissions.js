import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import getSheet from '../../shared/sheet.js';
import { loadOrgConfig, listSites, mutatePermissions } from '../api.js';
import {
  buildSlots, siteNames, parseMembers, addMembers, removeMember, scopeLabel,
} from '../utils.js';

await import(`${getNx()}/blocks/shared/breadcrumb/breadcrumb.js`);
await import(`${getNx()}/blocks/shared/picker/picker.js`);
await import(`${getNx()}/blocks/shared/search/search.js`);
await import(`${getNx()}/blocks/shared/dialog/dialog.js`);
await import('../da-permissions-table/da-permissions-table.js');

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

const [form, buttons, style] = await Promise.all([
  getSheet(`${getNx2()}/styles/form.css`),
  getSheet(`${getNx2()}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);

const INFO_DISMISSED_KEY = 'da-permissions-info-dismissed';
const DOCS_URL = 'https://docs.da.live/administrators/guides/permissions';
const CLOSE_ICON_SRC = '/img/icons/s2-icon-close-20-n.svg';
const LEVEL_LABEL = { read: 'Read', write: 'Write', none: 'None' };

/**
 * Container component for the permissions block. Routes on `org`/`site`
 * (set by `permissions.js` on every hash change, same element reused), loads
 * the org config, and renders the B2 table — or the empty/loading/error
 * states in its place.
 */
class DaPermissions extends LitElement {
  static properties = {
    org: { attribute: false },
    site: { attribute: false },
    _status: { state: true },
    _rules: { state: true },
    _sites: { state: true },
    _expanded: { state: true },
    _readOnly: { state: true },
    _busy: { state: true },
    _infoDismissed: { state: true },
    _adding: { state: true },
    _confirmRemove: { state: true },
  };

  constructor() {
    super();
    this.org = null;
    this.site = null;
    this._status = 'empty';
    this._rules = [];
    this._sites = [];
    this._expanded = new Set();
    this._readOnly = false;
    this._busy = false;
    this._infoDismissed = localStorage.getItem(INFO_DISMISSED_KEY) === 'true';
    this._adding = null;
    this._confirmRemove = null;
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
      this._load();
    } else if (changed.has('site') && this.site !== changed.get('site')) {
      this._expanded = new Set();
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
    this._sites = sites;
  }

  get _slots() {
    return buildSlots(this._rules, this.site);
  }

  get _siteNames() {
    return siteNames(this._sites, this._rules);
  }

  get _editable() {
    return this._status === 'ok' && !this._readOnly;
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
    await this._mutate((config) => addMembers(config, path, level, who));
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
    await this._mutate((config) => removeMember(config, path, level, who));
  }

  // Captures `org` before the request and drops the result if the container
  // has since routed to a different org (consistent with `_load`'s guard).
  // All rules are org-wide, so a site-only change within the same org still
  // applies the saved result.
  async _mutate(mutateFn) {
    const { org } = this;
    this._busy = true;
    const result = await mutatePermissions(org, mutateFn);
    if (this.org !== org) return;
    this._busy = false;

    if (result.ok) {
      this._rules = result.rules;
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
          <nx-search variant="field" placeholder="Filter by person or folder…"></nx-search>
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
      return html`<p class="permissions-message">Could not load permissions (${this._status}).</p>`;
    }
    if (this._status === 'no-sheet') {
      return html`
        <p class="permissions-message">
          This org has no permissions sheet yet — set one up in the org config.
          <a href="/config#/${this.org}/">Open org config</a>
        </p>`;
    }
    return html`
      ${this._readOnly ? html`<p class="permissions-message">You have read-only access to this configuration.</p>` : nothing}
      <da-permissions-table
        .slots=${this._slots}
        .org=${this.org}
        .site=${this.site}
        .expanded=${this._expanded}
        .editable=${this._editable}
        .busy=${this._busy}
        .adding=${this._adding}
        @permissions-toggle=${(e) => this._onToggle(e)}
        @permissions-add-open=${(e) => this._onAddOpen(e)}
        @permissions-add-cancel=${() => this._onAddCancel()}
        @permissions-add=${(e) => this._onAdd(e)}
        @permissions-remove=${(e) => this._onRemoveRequest(e)}
      ></da-permissions-table>
      ${this._renderRemoveDialog()}`;
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
