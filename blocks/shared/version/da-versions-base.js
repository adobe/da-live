import { LitElement, html, nothing } from 'da-lit';
import { formatDate } from '../utils.js';
import { getNx2Api } from '../../../scripts/utils.js';
import { formatVersions } from './helpers.js';

export default class DaVersionsBase extends LitElement {
  static properties = {
    open: { attribute: false },
    path: { type: String },
    _versions: { state: true },
    _newVersion: { state: true },
    _loading: { state: true },
  };

  async getVersions() {
    if (!this.path) return;
    this._loading = true;
    this._versions = null;
    const { versions } = await getNx2Api();
    const resp = await versions.list(this.path);
    if (!resp.ok) {
      this._loading = false;
      return;
    }
    try {
      const json = await resp.json();
      this._versions = formatVersions(json);
    } catch {
      this._versions = [];
    }
    this._loading = false;
  }

  handleClose() {
    const opts = { bubbles: true, composed: true };
    this.dispatchEvent(new CustomEvent('close', opts));
  }

  handlePreview(e, entry) {
    e.stopPropagation();
    const entryEl = e.target.closest('.da-version-entry');
    if (!entryEl.classList.contains('is-open')) {
      entryEl.classList.toggle('is-open');
    }
    // A version is always a version of the open doc, so restore only needs the
    // version id — org/site/path come from the doc on the consumer side, which
    // lets the fetch go through api.js's versions.get for both backends. hlx5's
    // id is the /versionsource tail; hlx6's is the entry's ULID.
    const [, org, site] = this.path.split('/');
    const versionId = entry.url
      ? entry.url.replace(`/versionsource/${org}/${site}/`, '')
      : entry.versionId;
    const detail = { versionId, label: entry.label, date: entry.date };
    this.dispatchEvent(new CustomEvent('preview', { detail, bubbles: true, composed: true }));
  }

  handleExpand({ target }) {
    target.closest('.da-version-entry').classList.toggle('is-open');
  }

  async handleNewSubmit(e) {
    e.preventDefault();
    const entry = { ...this._newVersion };
    if (e.target.elements.label?.value) entry.label = e.target.elements.label.value;

    const { versions } = await getNx2Api();
    const res = await versions.create(this.path, entry.label ? { comment: entry.label } : {});
    if (res.status !== 201) return;

    this._newVersion = null;
    this._versions.unshift(entry);
    // TODO: The server does not respond with version details, so get a fresh list
    this.getVersions();
  }

  handleNew(e) {
    e.target.disabled = true;
    const { date, time } = formatDate();
    this._newVersion = { date, time, isVersion: true, users: [] };
  }

  handleCancel() {
    this._newVersion = null;
  }

  update(changedProps) {
    if (changedProps.has('open') && this.open) this.getVersions();
    super.update();
  }

  // --- render helpers (available to subclasses) ---

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
        <button class="da-version-btn da-version-btn-cancel" @click=${this.handleCancel}>Save</button>
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

  renderVersionList() {
    return this._versions.map((entry) => html`
      ${entry.isVersion ? this.renderVersion(entry) : this.renderAudits(entry)}
    `);
  }

  renderLoading() {
    return html`
      <li class="da-version-entry is-loading">
        <div class="da-version-loading-dot"></div>
        <p class="da-version-date">Loading...</p>
      </li>
    `;
  }
}
