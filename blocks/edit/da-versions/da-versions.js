import { LitElement, html, nothing } from '../../../deps/lit/lit-core.min.js';
import getSheet from '../../shared/sheet.js';
import { DA_ORIGIN } from '../../shared/constants.js';
import { formatDate, formatVersions } from './helpers.js';
import { daFetch } from '../../shared/utils.js';

const sheet = await getSheet('/blocks/edit/da-versions/da-versions.css');

export default class DaVersions extends LitElement {
  static properties = {
    path: {},
    _versions: { state: true },
    _newVersion: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.getVersions();
  }

  async getVersions() {
    const resp = await daFetch(`${DA_ORIGIN}/versionlist${this.path}`);
    if (!resp.ok) return;
    try {
      const json = await resp.json();
      this._versions = formatVersions(json);
    } catch {
      this._versions = [];
    }
  }

  handleClose() {
    const opts = { bubbles: true, composed: true };
    const event = new CustomEvent('close', opts);
    this.dispatchEvent(event);
  }

  async handlePreview(e, entry) {
    e.stopPropagation();
    const detail = { url: `${DA_ORIGIN}${entry.url}` };
    const opts = { detail, bubbles: true, composed: true };
    const event = new CustomEvent('preview', opts);
    this.dispatchEvent(event);
  }

  handleExpand({ target }) {
    target.closest('.da-version-entry').classList.toggle('is-open');
  }

  async handleNewSubmit(e) {
    e.preventDefault();
    const entry = { ...this._newVersion };
    if (e.target.elements.label?.value) entry.label = e.target.elements.label.value;

    const opts = { method: 'POST' };
    if (entry.label) opts.body = JSON.stringify({ label: entry.label });

    const res = await daFetch(`${DA_ORIGIN}/versionsource${this.path}`, opts);
    if (res.status !== 201) return;

    this._newVersion = null;
    this._versions.unshift(entry);
  }

  handleNew(e) {
    e.target.disabled = true;
    const { date, time } = formatDate();
    this._newVersion = { date, time, isVersion: true, users: [] };
  }

  renderAudits(entry) {
    return html`
      <li class="da-version-entry is-audit" @click=${this.handleExpand}>
        <button class="da-version-btn">View</button>
        <p class="da-version-date">${entry.date}</p>
        <ul class="da-version-audit-entries">
          ${entry.audits.map((auEntry) => html`
            <li class="da-version-audit-entry">
              <p class="da-version-time">${auEntry.time}</p>
              <div class="da-audit-names">
              ${auEntry.users.map((user) => html`<p>${user.email}</p>`)}
              </div>
            </li>
          `)}
        </ul>
      </li>
    `;
  }

  renderNewVersion() {
    const entry = this._newVersion;
    return html`
      <li class="da-version-entry is-new">
        <form @submit=${this.handleNewSubmit}>
          <button class="da-version-btn" click=${this.handleSave}>Save</button>
          <p class="da-version-date">${entry.date}</p>
          <input type="text" name="label" placeholder="Label" class="da-version-new-input" />
        </form>
        <button class="da-version-btn da-version-btn-cancel" click=${this.handleCancel}>Save</button>
      </li>
    `;
  }

  renderVersion(entry) {
    return html`
      <li class="da-version-entry is-version" @click=${this.handleExpand}>
        <button class="da-version-btn" @click=${(e) => this.handlePreview(e, entry)}>Restore</button>
        <p class="da-version-date">${entry.date}</p>
        ${entry.label ? html`<p class="da-version-label">${entry.label}</p>` : nothing}
        <ul class="da-version-audit-entries">
          <li class="da-version-audit-entry">
            <p class="da-version-time">${entry.time}</p>
            <div class="da-audit-names">
            ${entry.users.map((user) => html`<p>${user.email}</p>`)}
            </div>
          </li>
        </ul>
      </li>
    `;
  }

  renderNow() {
    return html`
      <li class="da-version-entry is-now">
        <button class="da-version-btn" @click=${this.handleNew}>Create</button>
        <p class="da-version-date">Now</p>
      </li>
    `;
  }

  render() {
    if (!this._versions) return nothing;
    return html`
      <div class="da-versions-panel">
        <p class="da-versions-title">
          <button class="da-versions-close-btn" @click=${this.handleClose} aria-label="Close history pane">History</button>
        </p>
        <ul class="da-version-list">
          ${this._newVersion ? this.renderNewVersion() : this.renderNow()}
          ${this._versions.map((entry) => html`${entry.isVersion ? this.renderVersion(entry) : this.renderAudits(entry)}`)}
        </ul>
      </div>
    `;
  }
}

customElements.define('da-versions', DaVersions);
