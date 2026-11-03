import { LitElement, html, nothing, until } from 'da-lit';
import { delay, sanitizeName, formatDate } from '../utils.js';
import { getNx, getNx2, getNx2Api } from '../../../scripts/utils.js';
import { ICONS, iconPathForExt, getTypeLabel, isImageExt } from '../icons.js';
import { getFileItemHref } from './navigation.js';

import {
  fetchAemStatus,
  fetchDaStatus,
  doesFileExist,
  getRenamedPath,
} from './item.js';

// Styles
const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
await import(`${getNx()}/blocks/shared/popover/popover.js`);
await import(`${getNx2()}/blocks/shared/card/card.js`);
const [FORM, BUTTONS, STYLE] = await Promise.all([
  loadStyle(`${getNx2()}/styles/form.css`),
  loadStyle(`${getNx2()}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);

export default class DaFileItem extends LitElement {
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
    columns: { type: Array, reflect: true },
    folder: { attribute: false },
    modifiedBy: { type: String },
    size: { type: String, reflect: true },
    isChecked: { attribute: 'ischecked', type: Boolean },
    isFavorited: { attribute: 'isfavorited', type: Boolean },
    _isRenaming: { state: true },
    _detailsOpen: { state: true },
    _preview: { state: true },
    _live: { state: true },
    _version: { state: true },
    _lastModifiedBy: { state: true },
    _daStatusError: { state: true },
    _imageUrl: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [FORM, BUTTONS, STYLE];
  }

  disconnectedCallback() {
    this.resetImage();
    this._modifierObserver?.disconnect();
    this._modifierObserver = null;
    this._daStatusRequest = null;
    this._statusToken = {};
    super.disconnectedCallback();
  }

  willUpdate(props) {
    if (props.has('path') || props.has('ext') || props.has('view')) this.resetImage();
    if (props.has('path') || props.has('ext') || props.has('date')) this.resetStatus();
  }

  updated() {
    if (this.isConnected && this.columns?.includes('modifiedBy') && this.modifiedBy === undefined
      && this.ext && this.ext !== 'link' && !this._daStatusRequest && !this._modifierObserver) {
      this._modifierObserver = new IntersectionObserver(([entry]) => {
        if (!entry?.isIntersecting) return;
        this._modifierObserver.disconnect();
        this._modifierObserver = null;
        this.updateDAStatus();
      });
      this._modifierObserver.observe(this);
    }
    if (!this.isConnected || this.view !== 'card' || !isImageExt(this.ext)
      || this._imageRequested || this._imageObserver) return;
    this._imageObserver = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      this.stopObservingImage();
      this.loadImage();
    });
    this._imageObserver.observe(this);
  }

  stopObservingImage() {
    this._imageObserver?.disconnect();
    this._imageObserver = null;
  }

  resetImage() {
    this.stopObservingImage();
    this._imageRequest = null;
    this._imageRequested = false;
    this.dropImage();
  }

  dropImage() {
    if (this._imageUrl) URL.revokeObjectURL(this._imageUrl);
    this._imageUrl = null;
  }

  async loadImage() {
    const { path } = this;
    const request = {};
    this._imageRequest = request;
    this._imageRequested = true;
    try {
      const { source } = await getNx2Api();
      const resp = await source.get(path);
      if (!resp.ok) return;
      const url = URL.createObjectURL(await resp.blob());
      if (this._imageRequest === request && this.isConnected) this._imageUrl = url;
      else URL.revokeObjectURL(url);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(`Could not load file preview for ${path}.`, error);
    }
  }

  renderFilePreview() {
    if (this._isRenaming) return html`<div class="file-preview-spinner" role="status" aria-label="Renaming"></div>`;
    if (this._imageUrl) return html`<img src=${this._imageUrl} alt="" @error=${this.dropImage}>`;
    return this.renderIcon();
  }

  async update(props) {
    if (props.has('rename')) {
      if (this.rename) this.selectInput();
    }
    if (props.has('path')) {
      if (props.get('path') !== this.path) {
        this.closeDetails();
        this.popover?.close();
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

  async focusSelection() {
    await this.updateComplete;
    const card = this.shadowRoot.querySelector('nx-card');
    if (card) {
      await card.updateComplete;
      if (!card.selectable) return false;
      card.focus();
      return true;
    }
    const input = this.shadowRoot.querySelector('input[name="item-selected"]');
    input?.focus();
    return Boolean(input);
  }

  async updateAEMStatus() {
    const { path, _statusToken: token } = this;
    try {
      const { preview, live } = await fetchAemStatus(this);
      if (this.path !== path || this._statusToken !== token) return;
      this._preview = preview;
      this._live = live;
    } catch {
      if (this.path !== path || this._statusToken !== token) return;
      this._preview = { status: 500 };
      this._live = { status: 500 };
    }
  }

  async updateDAStatus() {
    const { path, _statusToken: token } = this;
    if (!this.columns?.includes('modifiedBy')) this._daStatusRequest = null;
    this._daStatusRequest ??= fetchDaStatus(this).catch(() => undefined);
    const status = await this._daStatusRequest;
    if (this.path !== path || this._statusToken !== token) return;
    this._daStatusError = !status;
    if (!status) return;
    this._version = status.version;
    this._lastModifiedBy = status.lastModifiedBy;
  }

  resetStatus() {
    this._modifierObserver?.disconnect();
    this._modifierObserver = null;
    this._daStatusRequest = null;
    this._statusToken = {};
    this.closeDetails();
    this._version = null;
    this._lastModifiedBy = null;
    this._daStatusError = false;
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

  requestFavorite() {
    this.dispatchEvent(new CustomEvent('favoritechange', { bubbles: true, composed: true }));
  }

  setStatus(text, description, type) {
    const opts = { detail: { text, description, type }, bubbles: true, composed: true };
    const event = new CustomEvent('onstatus', opts);
    this.dispatchEvent(event);
  }

  doesFileExist(path) {
    return doesFileExist(path);
  }

  handleRenameKeydown(e) {
    if (e.key === 'Escape') this.handleChecked();
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

  get popover() { return this.shadowRoot.querySelector('nx-popover.da-item-details'); }

  renderCardMenu() {
    return html`
      <div slot="actions" class="card-menu">
        <button type="button" class="card-more nx-action-btn-icon nx-btn-sm"
          aria-label="More" title="More" aria-haspopup="dialog" aria-expanded=${Boolean(this._detailsOpen)}
          @click=${this.toggleDetails}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-more-20-n.svg#icon"></use></svg>
        </button>
        ${this.renderDetailsPopover()}
      </div>`;
  }

  async toggleDetails({ currentTarget }) {
    if (this._detailsOpen) {
      this.popover?.close();
      this.closeDetails();
      return;
    }
    this._detailsOpen = true;
    if (this.view !== 'card' || this.ext) {
      this.updateAEMStatus();
      this.updateDAStatus();
    }
    await this.updateComplete;
    this.popover?.show({ anchor: currentTarget, placement: 'auto' });
  }

  closeDetails = () => {
    this._detailsOpen = false;
    this._preview = null;
    this._live = null;
    if (!this.columns?.includes('modifiedBy')) {
      this._version = null;
      this._lastModifiedBy = null;
    }
  };

  renderDate() {
    if (!this.date) return nothing;
    const { date, time } = formatDate(this.date);
    return `${date} ${time}`;
  }

  renderRename(slot = nothing) {
    return html`
      <form slot=${slot} class="da-item-list-item-rename" @submit=${this.handleRenameSubmit}>
        <span class="da-item-list-item-type">
          ${this.renderIcon()}
        </span>
        <input type="text" class="nx-input" value="${this.name}" @input=${this.handleRename} @keydown=${this.handleRenameKeydown} name="new-name" aria-label="Rename item">
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

  renderItem({ includeMeta = true } = {}) {
    const href = getFileItemHref(this);

    return html`
      <a href="${this.ext === 'link' ? until(href) : href}" class="da-item-list-item-title" data-column="name">
        <div class="da-item-list-item-info">
          ${this._isRenaming ? html`<span class="da-item-list-item-type"><div class="icon rename-icon"></div></span>
          ` : html`
            <span class="da-item-list-item-type">
              ${this.renderIcon()}
            </span>
          `}
          <div class="da-item-list-item-name">
            <span class="da-item-list-item-name-text" title=${this.name}>${this.name}</span>
          </div>
        </div>
      </a>
      ${includeMeta ? this.renderRowMeta() : nothing}`;
  }

  renderRowMeta() {
    return html`
      <div class="da-item-list-item-meta da-item-list-item-type-label" data-column="type">${getTypeLabel(this.ext)}</div>
      <div class="da-item-list-item-meta da-item-list-item-date" data-column="modified">${this.ext === 'link' ? '—' : (this.renderDate() || '—')}</div>`;
  }

  renderRowColumn(column) {
    switch (column) {
      case 'select':
        return this.allowselect ? html`<div role="cell">${this.renderCheckBox()}</div>`
          : html`<span class="da-item-list-item-selection-placeholder" data-column="select" aria-hidden="true"></span>`;
      case 'name':
        return html`<div role="cell" class="da-item-list-item-name-cell">${this.rename ? this.renderRename() : this.renderItem({ includeMeta: false })}</div>`;
      case 'type':
        return html`<div role="cell" class="da-item-list-item-meta da-item-list-item-type-label" data-column="type">${getTypeLabel(this.ext)}</div>`;
      case 'folder':
        return html`<div role="cell" class="da-item-list-item-meta da-item-list-item-folder" data-column="folder">
          ${this.folder?.href ? html`<a href=${this.folder.href} title=${this.folder.label}>${this.folder.label}</a>` : (this.folder?.label || '—')}
        </div>`;
      case 'modified':
        return html`<div role="cell" class="da-item-list-item-meta da-item-list-item-date" data-column="modified">${this.ext === 'link' ? '—' : (this.renderDate() || '—')}</div>`;
      case 'modifiedBy':
        return this.renderModifier();
      case 'actions':
        return html`<div role="cell" class="da-item-list-item-actions" data-column="actions">
          ${this.renderDetailsControl()}${this.renderFavorite()}
        </div>`;
      default:
        return nothing;
    }
  }

  renderModifier() {
    const modifier = this.modifiedBy ?? this._lastModifiedBy;
    return html`<div role="cell" class="da-item-list-item-meta da-item-list-item-modifier" data-column="modifiedBy" title=${modifier || nothing}>${modifier ? html`<span class="modifier-icon" aria-hidden="true"></span><span class="modifier-name">${modifier}</span>` : '—'}</div>`;
  }

  renderFavorite(className = 'da-item-list-item-favorite', slot = nothing) {
    return html`
      <button slot=${slot} type="button" class="${className} nx-action-btn-icon ${this.view !== 'card' && this.size === 'm' ? '' : 'nx-btn-sm'}"
        aria-label=${this.isFavorited ? 'Remove as Favorite' : 'Mark as Favorite'}
        title=${this.isFavorited ? 'Remove as Favorite' : 'Mark as Favorite'}
        aria-pressed=${this.isFavorited ? 'true' : 'false'}
        @click=${this.requestFavorite}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <use href="${this.isFavorited ? ICONS.favorite : '/img/icons/s2-icon-star-20-n.svg'}#icon"></use>
        </svg>
      </button>`;
  }

  renderCheckBox() {
    return html`
      <label class="nx-checkbox da-item-list-item-select" data-column="select">
        <input type="checkbox" name="item-selected" id="item-selected-${this.idx}" .checked="${this.isChecked}" @click="${this.handleChecked}" aria-label="Select item">
      </label>
    `;
  }

  renderDaDetails() {
    const unavailable = this._daStatusError ? 'Unavailable' : 'Checking';
    return html`
      <div class="da-list-item-da-details-version">
        <p class="da-list-item-details-title">Version</p>
        <p>${this._version || this._version === 0 ? this._version : unavailable}</p>
      </div>
      <div class="da-list-item-da-details-modified">
        <p class="da-list-item-details-title">Modified by</p>
        <p>${this._lastModifiedBy || unavailable}</p>
      </div>
    `;
  }

  renderAemDate(env) {
    if (!this[env]) {
      return 'Checking';
    }
    if (this[env].status >= 400) return 'Unavailable';
    if (this[env].lastModified) {
      return `${this[env].lastModified.date} ${this[env].lastModified.time}`;
    }
    return env === '_preview' ? 'Not previewed' : 'Not published';
  }

  renderCard() {
    const href = getFileItemHref(this);
    return html`
      <nx-card class="card" .selectable=${Boolean(this.allowselect)} .selected=${Boolean(this.isChecked)}
        @nx-card-selection-change=${(e) => this.handleChecked(e.detail)}>
        <a slot="media" class="card-preview" href="${this.ext === 'link' ? until(href) : href}" tabindex="-1" aria-hidden="true">
          ${this.renderFilePreview()}
        </a>
        ${this.isFavorited ? this.renderFavorite('card-favorite', 'overlay-actions') : nothing}
        ${this.rename ? this.renderRename('content') : html`
          <a slot="heading" href="${this.ext === 'link' ? until(href) : href}" title=${this.name}>
            ${this.name}
          </a>
          ${this.renderCardMenu()}`}
        <span slot="metadata" class="card-type">${getTypeLabel(this.ext)}</span>
        <span slot="metadata" class="card-date">${this.ext === 'link' ? '—' : (this.renderDate() || '—')}</span>
      </nx-card>`;
  }

  renderDetailsControl() {
    if (!this.ext || this.ext === 'link') return nothing;
    return html`
      <button
        type="button"
        aria-label="More info"
        title="More info"
        aria-haspopup="dialog"
        aria-expanded=${Boolean(this._detailsOpen)}
        @click=${this.toggleDetails}
        class="nx-action-btn-icon is-visible ${this.size === 'm' ? 'nx-btn-lg' : ''} ${this._detailsOpen ? 'is-active' : ''}">
        <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-infocircle-20-n.svg#icon"></use></svg>
      </button>
      ${this.renderDetailsPopover()}`;
  }

  renderDetailsPopover() {
    const card = this.view === 'card';
    return this._detailsOpen ? html`<nx-popover placement='auto' class="da-item-details" role="dialog" aria-label="Details for ${this.name}" @close=${this.closeDetails}>
        ${card ? html`
          ${this.ext ? html`<section class="card-details" aria-label="Details">
            <h3>Details</h3>
            ${this.renderDetailsContent()}
          </section><hr>` : nothing}
          <button type="button" class="card-favorite-action nx-action-btn-quiet" @click=${() => {
          this.requestFavorite();
          this.popover?.close();
          this.closeDetails();
          this.shadowRoot.querySelector('.card-more')?.focus();
        }}>
            <span>${this.isFavorited ? 'Remove as Favorite' : 'Mark as Favorite'}</span>
            <svg viewBox="0 0 20 20" aria-hidden="true"><use href="${this.isFavorited ? ICONS.favorite : '/img/icons/s2-icon-star-20-n.svg'}#icon"></use></svg>
          </button>` : this.renderDetailsContent()}
      </nx-popover>` : nothing;
  }

  renderDetailsContent() {
    return html`
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
      `;
  }

  render() {
    if (this.view === 'card') return this.renderCard();
    if (this.columns) {
      return html`<div class="da-item-list-item-inner">
        ${this.columns.map((column) => this.renderRowColumn(column))}
      </div>`;
    }
    return html`
      <div class="da-item-list-item-inner">
        ${this.allowselect ? this.renderCheckBox() : html`<span class="da-item-list-item-selection-placeholder" data-column="select" aria-hidden="true"></span>`}
        ${this.rename ? html`${this.renderRename()}${this.renderRowMeta()}` : this.renderItem()}
        <div class="da-item-list-item-actions" data-column="actions">
          ${this.renderDetailsControl()}
          ${this.renderFavorite()}
        </div>
      </div>
    `;
  }
}

customElements.define('da-file-item', DaFileItem);
