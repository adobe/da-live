import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import getSheet from '../../shared/sheet.js';
import { referencedOrgIds, listDirectoryOrgs, connectDirectory, disconnectDirectory } from '../../shared/directory.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

const [form, buttons, style] = await Promise.all([
  getSheet(`${getNx2()}/styles/form.css`),
  getSheet(`${getNx2()}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);

const CONNECT_ERRORS = {
  invalid_credentials: 'Adobe did not accept that client ID and secret.',
  wrong_org: 'That credential cannot list people in this organization. Create it in this organization\'s Developer Console with the User Management API.',
  missing_credentials: 'Enter both a client ID and a client secret.',
  not_member: 'You need to be a member of this organization to connect it.',
  failed: 'Could not connect the organization. Try again.',
};

class DaPermissionsDirectory extends LitElement {
  static properties = {
    rules: { attribute: false },
    _orgs: { state: true },
    _connect: { state: true },
    _confirmDisconnect: { state: true },
    _busyOrg: { state: true },
  };

  constructor() {
    super();
    this.rules = [];
    this._orgs = undefined;
    this._connect = null;
    this._confirmDisconnect = null;
    this._busyOrg = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [form, buttons, style];
    this._loadStatus();
  }

  async _loadStatus() {
    this._orgs = await listDirectoryOrgs();
  }

  get _rows() {
    const orgs = this._orgs ?? [];
    return referencedOrgIds(this.rules).map((id) => {
      const org = orgs.find((o) => o.orgIdent?.toLowerCase() === id.toLowerCase());
      return {
        orgIdent: org?.orgIdent ?? id,
        orgName: org?.orgName,
        member: Boolean(org),
        connected: Boolean(org?.connected),
      };
    });
  }

  _openConnect(row) {
    this._connect = {
      orgIdent: row.orgIdent,
      orgName: row.orgName,
      clientId: '',
      clientSecret: '',
      busy: false,
      error: null,
    };
  }

  _updateConnect(field, value) {
    this._connect = { ...this._connect, [field]: value, error: null };
  }

  async _submitConnect(e) {
    e?.preventDefault();
    const { orgIdent, clientId, clientSecret, busy } = this._connect ?? {};
    if (busy) return;
    if (!clientId?.trim() || !clientSecret?.trim()) {
      this._connect = { ...this._connect, error: 'missing_credentials' };
      return;
    }
    this._connect = { ...this._connect, busy: true, error: null };
    const result = await connectDirectory(orgIdent, {
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
    });
    if (!this._connect) return;
    if (result.connected) {
      this._connect = null;
      await this._loadStatus();
      return;
    }
    this._connect = { ...this._connect, busy: false, error: result.error };
  }

  async _disconnectNow() {
    const { orgIdent } = this._confirmDisconnect;
    this._confirmDisconnect = null;
    this._busyOrg = orgIdent;
    await disconnectDirectory(orgIdent);
    await this._loadStatus();
    this._busyOrg = null;
  }

  _renderStatus(row) {
    if (!row.member) return html`<span class="status status-muted">Not a member</span>`;
    if (row.connected) return html`<span class="status status-connected">Connected</span>`;
    return html`<span class="status">Not connected</span>`;
  }

  _renderAction(row) {
    const busy = this._busyOrg === row.orgIdent;
    if (row.connected) {
      return html`<button type="button" class="nx-form-btn-secondary" ?disabled=${busy}
        @click=${() => { this._confirmDisconnect = row; }}>Disconnect</button>`;
    }
    return html`<button type="button" class="nx-form-btn-primary" ?disabled=${busy}
      @click=${() => this._openConnect(row)}>Connect</button>`;
  }

  _renderRow(row) {
    return html`
      <div class="org-row">
        <div class="org-name">
          <span>${row.orgName ?? 'IMS organization'}</span>
          <code>${row.orgIdent}</code>
        </div>
        ${this._renderStatus(row)}
        ${row.member ? html`<div class="org-action">${this._renderAction(row)}</div>` : nothing}
      </div>`;
  }

  _renderConnectDialog() {
    const connect = this._connect;
    if (!connect) return nothing;
    const update = (field) => (e) => this._updateConnect(field, e.target.value);
    const error = connect.error ? CONNECT_ERRORS[connect.error] ?? CONNECT_ERRORS.failed : null;
    return html`
      <nx-dialog title="Connect ${connect.orgName ?? connect.orgIdent} for @mentions" @close=${() => { this._connect = null; }}>
        <form class="connect-form" @submit=${(e) => this._submitConnect(e)}>
          <ol class="connect-steps">
            <li>
              Sign in to <a href="https://developer.adobe.com/console" target="_blank" rel="noopener">Adobe Developer Console</a>
              as a System Admin of ${connect.orgName ?? 'this organization'}.
            </li>
            <li>Create a new project.</li>
            <li>Add the <strong>User Management API</strong> and choose <strong>OAuth Server-to-Server</strong>.</li>
            <li>Open the credential and copy its client ID and client secret.</li>
            <li>Paste them below and select <strong>Connect</strong>.</li>
          </ol>
          <p class="connect-note">Experience Workspace stores the credential encrypted and only uses it to list people for mentions.</p>
          <div class="nx-form-field">
            <label for="directory-client-id">Client ID</label>
            <input id="directory-client-id" class="nx-input" autocomplete="off" spellcheck="false"
              .value=${connect.clientId} @input=${update('clientId')}>
          </div>
          <div class="nx-form-field ${error ? 'nx-field-error' : ''}">
            <label for="directory-client-secret">Client secret</label>
            <input id="directory-client-secret" class="nx-input" type="password" autocomplete="off"
              .value=${connect.clientSecret} @input=${update('clientSecret')}
              aria-invalid=${error ? 'true' : 'false'}>
            ${error ? html`<p class="nx-input-error-msg" role="alert">${error}</p>` : nothing}
          </div>
          <button type="submit" hidden></button>
        </form>
        <button type="button" slot="actions" class="nx-form-btn-secondary" @click=${() => { this._connect = null; }}>Cancel</button>
        <button type="button" slot="actions" class="nx-form-btn-primary" ?disabled=${connect.busy}
          @click=${() => this._submitConnect()}>${connect.busy ? 'Connecting…' : 'Connect'}</button>
      </nx-dialog>`;
  }

  _renderDisconnectDialog() {
    const row = this._confirmDisconnect;
    if (!row) return nothing;
    return html`
      <nx-dialog title="Disconnect organization" @close=${() => { this._confirmDisconnect = null; }}>
        <p>
          People in ${row.orgName ?? row.orgIdent} will stop appearing in @mentions.
          Experience Workspace deletes the stored credential. The credential in Developer Console is not affected.
        </p>
        <button type="button" slot="actions" class="nx-form-btn-secondary" @click=${() => { this._confirmDisconnect = null; }}>Cancel</button>
        <button type="button" slot="actions" class="nx-form-btn-primary" @click=${() => this._disconnectNow()}>Disconnect</button>
      </nx-dialog>`;
  }

  _renderCard(rows) {
    if (this._orgs === undefined) return html`<p class="directory-message">Loading connection status…</p>`;
    if (this._orgs === null) return html`<p class="directory-message">Could not load connection status.</p>`;
    return html`<article class="scope-card">${rows.map((row) => this._renderRow(row))}</article>`;
  }

  render() {
    const rows = this._rows;
    if (!rows.length) return nothing;
    return html`
      <section class="scope-section">
        <div class="scope-section-header">
          <h3>Enable @mentions for comments</h3>
        </div>
        <p class="directory-intro">
          Connect an IMS organization so people in it, and in its groups, can be mentioned in comments.
        </p>
        ${this._renderCard(rows)}
      </section>
      ${this._renderConnectDialog()}
      ${this._renderDisconnectDialog()}`;
  }
}

customElements.define('da-permissions-directory', DaPermissionsDirectory);
