import { LitElement, html, nothing, until } from 'da-lit';
import { delay, sanitizeName, formatDate } from '../../shared/utils.js';
import { getNx, getNx2Api } from '../../../scripts/utils.js';
import getEditPath from '../shared.js';

// Styles
const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const STYLE = await loadStyle(import.meta.url);

const ICONS = {
  folder: '/img/icons/s2-icon-folder-20-n.svg',
  file: '/img/icons/s2-icon-filetext-20-n.svg',
  json: '/img/icons/s2-icon-data-20-n.svg',
  link: '/img/icons/s2-icon-link-20-n.svg',
  jpg: '/img/icons/s2-icon-image-20-n.svg',
  jpeg: '/img/icons/s2-icon-image-20-n.svg',
  png: '/img/icons/s2-icon-image-20-n.svg',
  svg: '/img/icons/s2-icon-image-20-n.svg',
  gif: '/img/icons/s2-icon-image-20-n.svg',
  avif: '/img/icons/s2-icon-image-20-n.svg',
  webp: '/img/icons/s2-icon-image-20-n.svg',
  mp4: '/img/icons/s2-icon-video-20-n.svg',
  media: '/img/icons/s2-icon-image-20-n.svg',
  pdf: '/img/icons/s2-icon-acrobatsolid-20-n.svg',
  folderClock: '/img/icons/s2-icon-folderclock-20-n.svg',
  favorite: '/blocks/browse/da-list-item/img/da-favorite.svg',
};

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
    this.shadowRoot.adoptedStyleSheets = [STYLE];
  }

  async update(props) {
    if (props.has('rename')) {
      if (this.rename) this.selectInput();
    }
    if (props.has('path')) {
      if (props.get('path') !== this.path) {
        this.classList.remove('is-expanded');
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
    this.classList.toggle('is-expanded');
    if (this.classList.contains('is-expanded')) {
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
    // determine base type
    const type = !this.ext ? 'folder' : this.ext;
    const iconPath = ICONS[type] || ICONS.file;
    return html`<svg viewBox="0 0 20 20"><use href="${iconPath}#icon"</svg>`;
  }

  renderItem() {
    let path = this.ext ? getEditPath({ path: this.path, ext: this.ext, editor: this.editor }) : `#${this.path}`;
    let externalUrlPromise;
    if (this.ext === 'link') {
      path = nothing;
      externalUrlPromise = getNx2Api()
        .then(({ source }) => source.get(this.path))
        .then((response) => response.json())
        .then((data) => data.externalUrl);
    }
    return html`
      <a href="${this.ext === 'link' ? until(externalUrlPromise) : path}" class="da-item-list-item-title">
        <div class="da-item-list-item-info">
          ${this._isRenaming ? html`<span class="da-item-list-item-type"><div class="icon rename-icon"></div></span>
          ` : html`
            <span class="da-item-list-item-type">
              ${this.renderIcon()}
              ${this.isFavorited ? html`<svg class="da-item-list-item-favorite" viewBox="0 0 20 20" aria-label="Favorited"><use href="${ICONS.favorite}#icon"</svg>` : nothing}
            </span>
          `}
          <div class="da-item-list-item-name">
            <span class="da-item-list-item-name-text">${this.name}</span>
          </div>
        </div>
        <div class="da-item-list-item-date">${this.ext === 'link' ? nothing : this.renderDate()}</div>
      </a>`;
  }

  renderCheckBox() {
    return html`
      <label class="checkbox-label">
        <input type="checkbox" name="item-selected" id="item-selected-${this.idx}" .checked="${this.isChecked}" @click="${this.handleChecked}" aria-label="Select item">
      </label>
    `;
  }

  renderDaDetails() {
    return html`
      <span class="da-item-list-item-type da-item-list-item-type-file-version">
        <svg viewBox="0 0 20 20"><use href="${ICONS.file}#icon"</svg>
      </span>
      <div class="da-list-item-da-details-version">
        <p class="da-list-item-details-title">Version</p>
        <p>${this._version || this._version === 0 ? this._version : 'Checking'}</p>
      </div>
      <div class="da-list-item-da-details-modified">
        <p class="da-list-item-details-title">Last Modified By</p>
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
      <div class="da-item-list-item-inner ${this.allowselect ? 'can-select' : ''}" role="gridcell">
        ${this.allowselect ? this.renderCheckBox() : nothing}
        ${this.rename ? this.renderRename() : this.renderItem()}
        <button
          aria-label="Open"
          @click=${this.toggleExpand}
          class="da-item-list-item-expand-btn ${(this.ext && this.ext !== 'link') ? 'is-visible' : ''}">
        </button>
      </div>
      <div class="da-item-list-item-details ${this.allowselect ? 'can-select' : ''}" role="gridcell">
        ${this.renderDaDetails()}
        <a
          href=${this._preview?.redirect || this._preview?.url}
          target="_blank"
          aria-label="Open preview"
          @click=${this.showPreview}
          class="da-item-list-item-aem-btn">
          <div class="da-item-list-item-aem-icon ${this._preview?.status === 200 ? 'is-active' : ''}"></div>
          <div class="da-aem-icon-details">
            <p class="da-list-item-details-title">Previewed${this._live?.redirect ? ' Redirect' : ''}</p>
            <p class="da-aem-icon-date">${this._preview?.status === 401 || this._preview?.status === 403 ? 'Not authorized' : this.renderAemDate('_preview')}</p>
          </div>
        </a>
        <a
          href=${this._live?.redirect || this._live?.url}
          target="_blank"
          aria-label="Open preview"
          @click=${this.showPreview}
          class="da-item-list-item-aem-btn">
          <div class="da-item-list-item-aem-icon ${this._live?.status === 200 ? 'is-active' : ''}"></div>
          <div class="da-aem-icon-details">
            <p class="da-list-item-details-title">Published${this._live?.redirect ? ' Redirect' : ''}</p>
            <p class="da-aem-icon-date">${this._live?.status === 401 || this._live?.status === 403 ? 'Not authorized' : this.renderAemDate('_live')}</p>
          </div>
        </a>
      </div>
    `;
  }
}

customElements.define('da-list-item', DaListItem);
