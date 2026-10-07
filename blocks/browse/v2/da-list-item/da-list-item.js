import { LitElement, html, nothing, until } from 'da-lit';
import { delay, sanitizeName, formatDate } from '../../../shared/utils.js';
import { getNx, getNx2, getNx2Api } from '../../../../scripts/utils.js';
import { ICONS, iconPathForExt, getTypeLabel } from '../../../shared/icons.js';
import { getBrowseItemHref } from '../shared/navigation.js';

// Styles
const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const [FORM, STYLE] = await Promise.all([
  loadStyle(`${getNx2()}/styles/form.css`),
  loadStyle(import.meta.url),
]);

export default class DaListItem extends LitElement {
  static properties = {
    idx: { type: Number },
    name: { type: String },
    path: { type: String },
    date: { type: Number },
    ext: { type: String },
    editor: { type: String },
    rename: { type: Boolean },
    allowselect: { type: Boolean },
    isChecked: { attribute: 'ischecked', type: Boolean },
    isFavorited: { attribute: 'isfavorited', type: Boolean },
    _isRenaming: { type: Boolean },
    _isExpanded: { type: Boolean, state: true },
    _preview: { state: true },
    _live: { state: true },
    _version: { state: true },
    _lastModifedBy: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [FORM, STYLE];
  }

  async update(props) {
    if (props.has('rename')) {
      if (this.rename) this.selectInput();
    }
    if (props.has('path')) {
      if (props.get('path') !== this.path) {
        this.classList.remove('is-expanded');
        this._isExpanded = false;
      }
    }

    super.update(props);
  }

  selectInput() {
    setTimeout(() => {
      const input = this.shadowRoot.querySelector('.da-item-list-item-rename input');
      input.focus();
      input.select();
    }, 250);
  }

  async updateAEMStatus() {
    const { status, asJson } = await getNx2Api();
    // AEM resolves HTML pages by their extensionless path.
    const path = this.ext === 'html' ? this.path.slice(0, -5) : this.path;
    const { data: json } = await asJson(status.get(path));

    if (json) {
      this._preview = {
        status: json.preview.status,
        url: json.preview.url,
        lastModified: json.preview.lastModified ? formatDate(json.preview.lastModified) : null,
        redirect: json.live.redirectLocation,
      };
      this._live = {
        status: json.live.status,
        url: json.live.url,
        lastModified: json.live.lastModified ? formatDate(json.live.lastModified) : null,
        redirect: json.live.redirectLocation,
      };
      return;
    }
    this._preview = { status: 401 };
    this._live = { status: 401 };
  }

  async updateDAStatus() {
    const { versions, source, isHlx6 } = await getNx2Api();
    const [, org, site] = this.path.split('/');

    const resp = await versions.list(this.path);
    if (!resp.ok) return;
    const json = await resp.json();

    // hlx6 no longer keeps last-modified info in the version records, and its
    // version entries are ULID-based rather than /versionsource urls. Count the
    // version records and HEAD the document for the last-modified-by header.
    if (await isHlx6(org, site)) {
      this._version = json.filter((entry) => entry.version).length;
      const headResp = await source.getMetadata(this.path);
      const lastModifiedBy = headResp?.headers?.get('x-last-modified-by');
      this._lastModifedBy = lastModifiedBy
        ? lastModifiedBy.split('@')[0].toLowerCase()
        : 'anonymous';
      return;
    }

    if (json.length === 0) {
      this._lastModifedBy = 'anonymous';
      this._version = 0;
      return;
    }

    json.sort((a, b) => a.timestamp - b.timestamp);
    const { length: count } = json.reduce((acc, entry) => {
      if (entry.url?.startsWith('/versionsource')) acc.push(entry);
      return acc;
    }, []);
    this._version = count;
    this._lastModifedBy = json.pop().users.map(
      (user) => user.email.split('@')[0],
    ).join(', ').toLowerCase();
  }

  handleChecked(e) {
    this.isChecked = !this.isChecked;
    const opts = {
      detail: { checked: this.isChecked, shiftKey: e?.shiftKey ?? false },
      bubbles: true,
      composed: true,
    };
    const event = new CustomEvent('checked', opts);
    this.dispatchEvent(event);
  }

  notifyRenamed(oldPath) {
    const opts = { detail: { path: this.path, name: this.name, date: this.date, oldPath } };
    const event = new CustomEvent('renamecompleted', opts);
    this.dispatchEvent(event);
  }

  setStatus(text, description, type) {
    const opts = { detail: { text, description, type }, bubbles: true, composed: true };
    const event = new CustomEvent('onstatus', opts);
    this.dispatchEvent(event);
  }

  async doesFileExist(path) {
    const { source } = await getNx2Api();
    const { status } = await source.getMetadata(path);
    return status === 200;
  }

  async handleRenameSubmit(e) {
    e.preventDefault();

    const newName = sanitizeName(e.target.elements['new-name'].value, { trimTrailing: true });

    if (e.submitter.value === 'cancel' || this.name === newName) {
      this.handleChecked();
    } else if (!newName) {
      this.setStatus('A name is required.', 'Please enter a valid name.');
      await delay(2000);
      this.setStatus();
    } else {
      const idx = this.path.lastIndexOf(this.name);
      const oldPath = this.path;
      const newPath = `${this.path.slice(0, idx)}${newName}${this.path.slice(idx + this.name.length)}`;

      const fileExists = await this.doesFileExist(newPath);
      if (fileExists) {
        this.setStatus('A file with this name already exists.', 'Please choose a different name.');
        await delay(2000);
        this.setStatus();
        return;
      }

      this._preview = null;
      this._live = null;

      this.name = newName;
      this.path = newPath;
      this.rename = false;
      this._isRenaming = true;
      this.date = Date.now();

      const showStatus = setTimeout(() => { this.setStatus('Renaming', 'Please be patient. Renaming items with many children can take time.'); }, 5000);
      const { source } = await getNx2Api();
      const { status } = await source.move(oldPath, { destination: newPath });

      if (status === 204) {
        clearTimeout(showStatus);
        this.setStatus();
        this._isRenaming = false;
        // Uncheck the item and bubble up state
        this.handleChecked();
        this.updateAEMStatus();
        this.notifyRenamed(oldPath);
      } else {
        this.setStatus('There was an error. Refresh and try again.', 'error');
      }
    }
  }

  handleRename({ target }) {
    target.value = sanitizeName(target.value);
  }

  toggleExpand() {
    this._isExpanded = this.classList.toggle('is-expanded');
    if (this._isExpanded) {
      this.updateAEMStatus();
      this.updateDAStatus();
    } else {
      this._preview = null;
      this._live = null;
      this._version = null;
      this._lastModifedBy = null;
    }
  }

  renderDate() {
    if (!this.date) return nothing;
    const { date, time } = formatDate(this.date);
    return `${date} ${time}`;
  }

  renderRename() {
    return html`
      <form class="da-item-list-item-rename" @submit=${this.handleRenameSubmit}>
        <span class="da-item-list-item-type ${this.ext ? 'da-item-list-item-type-file' : 'da-item-list-item-type-folder'} ${this.ext ? `da-item-list-item-icon-${this.ext}` : ''}">
          ${this.renderIcon()}
        </span>
        <input type="text" value="${this.name}" @input=${this.handleRename} name="new-name" aria-label="Rename item">
        <div class="da-item-list-item-rename-actions">
          <button aria-label="Confirm" value="confirm">
            <div class="icon checkmark-icon"></div>
          </button>
          <button aria-label="Cancel" value="cancel">
            <div class="icon cancel-icon"></div>
          </button>
        </div>
      </form>
    `;
  }

  renderIcon() {
    return html`<svg viewBox="0 0 20 20"><use href="${iconPathForExt(this.ext)}#icon"</svg>`;
  }

  renderItem() {
    const href = getBrowseItemHref(this);

    const type = getTypeLabel(this.ext);

    return html`
      <a href="${this.ext === 'link' ? until(href) : href}" class="da-item-list-item-title" data-column="name">
        <div class="da-item-list-item-info">
          ${this._isRenaming ? html`<span class="da-item-list-item-type"><div class="icon rename-icon"></div></span>
          ` : html`
            <span class="da-item-list-item-type">
              ${this.renderIcon()}
              ${this.isFavorited ? html`<svg class="da-item-list-item-favorite" viewBox="0 0 20 20" aria-label="Favorited"><use href="${ICONS.favorite}#icon"</svg>` : nothing}
            </span>
          `}
          <div class="da-item-list-item-name">
            <span class="da-item-list-item-name-text" title=${this.name}>${this.name}</span>
          </div>
        </div>
      </a>
      <div class="da-item-list-item-meta da-item-list-item-type-label" data-column="type">${type}</div>
      <div class="da-item-list-item-meta da-item-list-item-date" data-column="modified">${this.ext === 'link' ? '—' : (this.renderDate() || '—')}</div>`;
  }

  renderCheckBox() {
    return html`
      <label class="nx-checkbox da-item-list-item-select" data-column="select">
        <input type="checkbox" name="item-selected" id="item-selected-${this.idx}" .checked="${this.isChecked}" @click="${this.handleChecked}" aria-label="Select item">
      </label>
    `;
  }

  renderDaDetails() {
    return html`
      <div class="da-list-item-da-details-version">
        <p class="da-list-item-details-title">Version</p>
        <p>${this._version || this._version === 0 ? this._version : 'Checking'}</p>
      </div>
      <div class="da-list-item-da-details-modified">
        <p class="da-list-item-details-title">Modified by</p>
        <p>${this._lastModifedBy ? this._lastModifedBy : 'Checking'}</p>
      </div>
    `;
  }

  renderAemDate(env) {
    if (!this[env]) {
      return 'Checking';
    }
    if (this[env].lastModified) {
      return `${this[env].lastModified.date} ${this[env].lastModified.time}`;
    }
    return env === '_preview' ? 'Not previewed' : 'Not published';
  }

  render() {
    return html`
      <div class="da-item-list-item-inner ${this.allowselect ? 'can-select' : ''}">
        ${this.allowselect ? this.renderCheckBox() : html`<span class="da-item-list-item-selection-placeholder" data-column="select" aria-hidden="true"></span>`}
        ${this.rename ? this.renderRename() : this.renderItem()}
        <button
          type="button"
          aria-label=${this._isExpanded ? 'Hide details' : 'Show details'}
          aria-expanded=${Boolean(this._isExpanded)}
          aria-controls="file-details"
          data-column="actions"
          @click=${this.toggleExpand}
          class="da-item-list-item-expand-btn ${(this.ext && this.ext !== 'link') ? 'is-visible' : ''}">
        </button>
      </div>
      <div id="file-details" class="da-item-list-item-details" role="gridcell">
        ${this.renderDaDetails()}
        <div class="da-list-item-aem-details">
          <p id="preview-label" class="da-list-item-details-title">Previewed${this._preview?.redirect ? ' redirect' : ''}</p>
          <a
            href=${this._preview?.redirect || this._preview?.url}
            target="_blank"
            title="Open preview"
            aria-labelledby="preview-label preview-date"
            @click=${this.showPreview}
            class="da-item-list-item-aem-btn">
            <span class="da-item-list-item-aem-icon ${this._preview?.status === 200 ? 'is-active' : ''}" aria-hidden="true"></span>
            <span id="preview-date" class="da-aem-icon-date">${this._preview?.status === 401 || this._preview?.status === 403 ? 'Not authorized' : this.renderAemDate('_preview')}</span>
          </a>
        </div>
        <div class="da-list-item-aem-details">
          <p id="live-label" class="da-list-item-details-title">Published${this._live?.redirect ? ' redirect' : ''}</p>
          <a
            href=${this._live?.redirect || this._live?.url}
            target="_blank"
            title="Open published page"
            aria-labelledby="live-label live-date"
            @click=${this.showPreview}
            class="da-item-list-item-aem-btn">
            <span class="da-item-list-item-aem-icon ${this._live?.status === 200 ? 'is-active' : ''}" aria-hidden="true"></span>
            <span id="live-date" class="da-aem-icon-date">${this._live?.status === 401 || this._live?.status === 403 ? 'Not authorized' : this.renderAemDate('_live')}</span>
          </a>
        </div>
      </div>
    `;
  }
}

customElements.define('da-list-item', DaListItem);
