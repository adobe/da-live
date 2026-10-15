import { LitElement, html, nothing, until } from 'da-lit';
import { delay, sanitizeName, formatDate } from '../../../shared/utils.js';
import { getNx, getNx2, getNx2Api } from '../../../../scripts/utils.js';
import { ICONS, iconPathForExt, getTypeLabel } from '../../../shared/icons.js';
import '../da-card-preview/da-card-preview.js';
import { getBrowseItemHref } from '../shared/navigation.js';

import {
  fetchAemStatus,
  fetchDaStatus,
  doesFileExist,
  getRenamedPath,
} from '../../shared/item.js';

// Styles
const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
await import(`${getNx()}/blocks/shared/popover/popover.js`);
const [FORM, BUTTONS, STYLE] = await Promise.all([
  loadStyle(`${getNx2()}/styles/form.css`),
  loadStyle(`${getNx2()}/styles/buttons.css`),
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
    view: { type: String, reflect: true },
    isChecked: { attribute: 'ischecked', type: Boolean },
    isFavorited: { attribute: 'isfavorited', type: Boolean },
    _isRenaming: { state: true },
    _detailsOpen: { state: true },
    _preview: { state: true },
    _live: { state: true },
    _version: { state: true },
    _lastModifiedBy: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [FORM, BUTTONS, STYLE];
  }

  async update(props) {
    if (props.has('rename')) {
      if (this.rename) this.selectInput();
    }
    if (props.has('path')) {
      if (props.get('path') !== this.path) {
        this.closeDetails();
      }
    }

    super.update(props);
  }

  async selectInput() {
    await this.updateComplete;
    const input = this.shadowRoot.querySelector('.da-item-list-item-rename input');
    input?.focus();
    input?.select();
  }

  async updateAEMStatus() {
    const { preview, live } = await fetchAemStatus(this);
    this._preview = preview;
    this._live = live;
  }

  async updateDAStatus() {
    const status = await fetchDaStatus(this);
    if (!status) return;
    this._version = status.version;
    this._lastModifiedBy = status.lastModifiedBy;
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

  doesFileExist(path) {
    return doesFileExist(path);
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
      const oldPath = this.path;
      const newPath = getRenamedPath({ path: oldPath, name: this.name, newName });

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

  get popover() { return this.shadowRoot.querySelector('nx-popover'); }

  async toggleDetails({ currentTarget }) {
    if (this._detailsOpen) {
      this.popover?.close();
      this.closeDetails();
      return;
    }
    this._detailsOpen = true;
    this.updateAEMStatus();
    this.updateDAStatus();
    await this.updateComplete;
    this.popover?.show({ anchor: currentTarget, placement: 'auto' });
  }

  closeDetails = () => {
    this._detailsOpen = false;
    this._preview = null;
    this._live = null;
    this._version = null;
    this._lastModifiedBy = null;
  };

  renderDate() {
    if (!this.date) return nothing;
    const { date, time } = formatDate(this.date);
    return `${date} ${time}`;
  }

  renderRename() {
    return html`
      <form class="da-item-list-item-rename" @submit=${this.handleRenameSubmit}>
        <span class="da-item-list-item-type">
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
    return html`<svg viewBox="0 0 20 20"><use href="${iconPathForExt(this.ext)}#icon"></use></svg>`;
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
              ${this.isFavorited ? html`<svg class="da-item-list-item-favorite" viewBox="0 0 20 20" aria-label="Favorited"><use href="${ICONS.favorite}#icon"></use></svg>` : nothing}
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

  renderCheckBox(className = 'da-item-list-item-select') {
    return html`
      <label class="nx-checkbox ${className}" data-column="select">
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
        <p>${this._lastModifiedBy ? this._lastModifiedBy : 'Checking'}</p>
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

  renderCard() {
    const href = getBrowseItemHref(this);
    return html`
      <div class="card">
        <div class="card-preview">
          <a href="${this.ext === 'link' ? until(href) : href}" tabindex="-1" aria-hidden="true">
            <da-card-preview .path=${this.path} .ext=${this.ext} ?busy=${this._isRenaming}></da-card-preview>
          </a>
          ${this.allowselect ? this.renderCheckBox('card-select') : nothing}
          ${this.isFavorited ? html`<svg class="card-favorite" viewBox="0 0 20 20" aria-label="Favorited"><use href="${ICONS.favorite}#icon"></use></svg>` : nothing}
        </div>
        ${this.rename ? this.renderRename() : html`
          <div class="card-info">
            <div class="card-heading">
              <a href="${this.ext === 'link' ? until(href) : href}" class="card-name">
                <span class="card-name-text" title=${this.name}>${this.name}</span>
              </a>
              ${this.renderDetailsControl()}
            </div>
            <div class="card-meta">
              <span class="card-type">${getTypeLabel(this.ext)}</span>
              <span class="card-date">${this.ext === 'link' ? '—' : (this.renderDate() || '—')}</span>
            </div>
          </div>`}
      </div>`;
  }

  renderDetailsControl() {
    if (!this.ext || this.ext === 'link') return nothing;
    return html`
      <button
        type="button"
        aria-label=${this._detailsOpen ? 'Hide details' : 'Show details'}
        aria-haspopup="dialog"
        aria-expanded=${Boolean(this._detailsOpen)}
        data-column="actions"
        @click=${this.toggleDetails}
        class="nx-action-btn-icon da-item-list-item-expand-btn is-visible ${this._detailsOpen ? 'is-active' : ''}">
        <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/${this._detailsOpen ? 's2-icon-chevronup-20-n' : 's2-icon-more-20-n'}.svg#icon"></use></svg>
      </button>
      ${this._detailsOpen ? html`<nx-popover placement='auto' class="da-item-details" role="dialog" aria-label="Details for ${this.name}" @close=${this.closeDetails}>
        ${this.renderDaDetails()}
        <div class="da-list-item-aem-details">
          <p id="preview-label" class="da-list-item-details-title">Previewed${this._preview?.redirect ? ' redirect' : ''}</p>
          <a
            href=${this._preview?.redirect || this._preview?.url || nothing}
            target="_blank"
            title="Open preview"
            aria-labelledby="preview-label preview-date"
            class="da-item-list-item-aem-btn">
            <span id="preview-date" class="da-aem-icon-date">${this._preview?.status === 401 || this._preview?.status === 403 ? 'Not authorized' : this.renderAemDate('_preview')}</span>
          </a>
        </div>
        <div class="da-list-item-aem-details">
          <p id="live-label" class="da-list-item-details-title">Published${this._live?.redirect ? ' redirect' : ''}</p>
          <a
            href=${this._live?.redirect || this._live?.url || nothing}
            target="_blank"
            title="Open published page"
            aria-labelledby="live-label live-date"
            class="da-item-list-item-aem-btn">
            <span id="live-date" class="da-aem-icon-date">${this._live?.status === 401 || this._live?.status === 403 ? 'Not authorized' : this.renderAemDate('_live')}</span>
          </a>
        </div>
      </nx-popover>` : nothing}`;
  }

  render() {
    if (this.view === 'card') return this.renderCard();
    return html`
      <div class="da-item-list-item-inner">
        ${this.allowselect ? this.renderCheckBox() : html`<span class="da-item-list-item-selection-placeholder" data-column="select" aria-hidden="true"></span>`}
        ${this.rename ? this.renderRename() : this.renderItem()}
        ${this.renderDetailsControl()}
      </div>
    `;
  }
}

customElements.define('da-list-item', DaListItem);
