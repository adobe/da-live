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
    layout: { type: String, reflect: true },
    dimensions: { type: String },
    size: { type: String, reflect: true },
    href: { type: String },
    iconHref: { attribute: false },
    documentPreview: { type: Boolean },
    isChecked: { attribute: 'ischecked', type: Boolean },
    isFavorited: { attribute: 'isfavorited', type: Boolean },
    _isRenaming: { state: true },
    _detailsOpen: { state: true },
    _preview: { state: true },
    _live: { state: true },
    _version: { state: true },
    _lastModifiedBy: { state: true },
    _imageUrl: { state: true },
    _document: { state: true },
    _previewError: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [FORM, BUTTONS, STYLE];
  }

  disconnectedCallback() {
    this.popover?.close();
    this.closeDetails();
    this.resetImage();
    super.disconnectedCallback();
  }

  willUpdate(props) {
    if (props.has('size') && !['s', 'm'].includes(this.size)) this.size = 's';
    if (['path', 'ext', 'view', 'documentPreview'].some((key) => props.has(key))) this.resetImage();
  }

  updated() {
    if (!this.isConnected || !['card', 'preview'].includes(this.view)
      || (!isImageExt(this.ext) && !(this.documentPreview && this.ext === 'html'))
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
    this._document = undefined;
    this._previewError = undefined;
    this.dropImage();
  }

  dropImage() {
    if (this._imageUrl) URL.revokeObjectURL(this._imageUrl);
    this._imageUrl = null;
  }

  async loadImage() {
    if (this._imageRequested) return;
    this.stopObservingImage();
    const { path } = this;
    const documentPreview = this.documentPreview && this.ext === 'html';
    const request = {};
    this._imageRequest = request;
    this._imageRequested = true;
    try {
      const { source } = await getNx2Api();
      const resp = await source.get(path);
      if (!resp.ok) throw new Error('Preview unavailable.');
      if (documentPreview) {
        const doc = new DOMParser().parseFromString(await resp.text(), 'text/html');
        const main = doc.querySelector('main') || doc.body;
        const title = main.querySelector('h1, h2')?.textContent.trim() || doc.title;
        const text = [...main.querySelectorAll('p')].map((p) => p.textContent.trim()).join(' ').slice(0, 600);
        const src = main.querySelector('img[src]')?.getAttribute('src');
        const imageUrl = src ? new URL(src, `https://content.da.live${path}`) : undefined;
        const imageHref = ['https:', 'http:'].includes(imageUrl?.protocol) ? imageUrl.href : undefined;
        if (!title && !text && !imageHref) throw new Error('Page preview unavailable.');
        if (this._imageRequest === request && this.isConnected) {
          this._document = { title, text, imageHref };
        }
        return;
      }
      const url = URL.createObjectURL(await resp.blob());
      if (this._imageRequest === request && this.isConnected) this._imageUrl = url;
      else URL.revokeObjectURL(url);
    } catch (error) {
      if (this._imageRequest === request && this.isConnected) this._previewError = error.message;
    }
  }

  renderFilePreview() {
    if (this._isRenaming) return html`<div class="file-preview-spinner" role="status" aria-label="Renaming"></div>`;
    if (this._imageUrl) {
      return html`<img src=${this._imageUrl} alt="" @error=${({ target }) => {
        if (target.getAttribute('src') === this._imageUrl) this.dropImage();
      }}>`;
    }
    if (this._document) {
      const preview = this._document;
      const { title, text, imageHref } = preview;
      return html`<article class="document-preview" aria-hidden="true">
        <strong>${title}</strong>
        ${imageHref ? html`<img src=${imageHref} alt="" referrerpolicy="no-referrer"
          @error=${() => {
            if (this._document !== preview || !this.isConnected) return;
            this._document = { ...this._document, imageHref: undefined };
            this._previewError = 'Image preview unavailable.';
          }}>` : nothing}
        <p>${text}</p>
      </article>`;
    }
    return this.renderIcon();
  }

  async update(props) {
    if (props.has('rename')) {
      if (this.rename) this.selectInput();
    }
    if (props.has('path')) {
      if (props.get('path') !== this.path) {
        this.popover?.close();
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
    const { path } = this;
    const request = this._detailsRequest;
    try {
      const { preview, live } = await fetchAemStatus(this);
      if (this.path !== path || this._detailsRequest !== request) return;
      this._preview = preview;
      this._live = live;
    } catch {
      if (this.path !== path || this._detailsRequest !== request) return;
      this._preview = { error: true };
      this._live = { error: true };
    }
  }

  async updateDAStatus() {
    const { path } = this;
    const request = this._detailsRequest;
    try {
      const status = await fetchDaStatus(this);
      if (!status || this.path !== path || this._detailsRequest !== request) return;
      this._version = status.version;
      this._lastModifiedBy = status.lastModifiedBy;
    } catch {
      if (this.path !== path || this._detailsRequest !== request) return;
      this._version = 'Unavailable';
      this._lastModifiedBy = 'Unavailable';
    }
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
        <button type="button" class="card-more nx-action-btn-icon ${this.size === 'm' ? '' : 'nx-btn-sm'}"
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
    this._detailsRequest = {};
    if (this.view !== 'card' || this.ext) {
      this.updateAEMStatus();
      this.updateDAStatus();
    }
    await this.updateComplete;
    this.popover?.show({ anchor: currentTarget, placement: 'auto' });
  }

  closeDetails = () => {
    this._detailsRequest = null;
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

  renderRename(slot = nothing) {
    return html`
      <form slot=${slot} class="da-item-list-item-rename" @submit=${this.handleRenameSubmit}>
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
    if (this.iconHref) return html`<span class="type-icon" aria-hidden="true" style="--file-icon: url('${this.iconHref}')"></span>`;
    return html`<svg viewBox="0 0 20 20" aria-hidden="true"><use href="${iconPathForExt(this.ext)}#icon"></use></svg>`;
  }

  get destination() {
    if (this.href !== undefined) return this.href;
    if (this.ext !== 'link') return getFileItemHref(this);
    const key = `${this.path}:${this.ext}:${this.editor}`;
    if (this._destinationKey !== key) {
      this._destinationKey = key;
      this._destination = getFileItemHref(this);
    }
    return this._destination;
  }

  renderItem() {
    const href = this.destination;

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

  renderFavorite(className = 'da-item-list-item-favorite', slot = nothing) {
    return html`
      <button slot=${slot} type="button" class="${className} nx-action-btn-icon ${this.size === 'm' ? '' : 'nx-btn-sm'}"
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
    if (this[env]?.error) return 'Unavailable';
    if (!this[env]) {
      return 'Checking';
    }
    if (this[env].lastModified) {
      return `${this[env].lastModified.date} ${this[env].lastModified.time}`;
    }
    return env === '_preview' ? 'Not previewed' : 'Not published';
  }

  renderCard() {
    const href = this.destination;
    const compact = this.layout === 'compact';
    return html`
      <nx-card class="card" .selectable=${Boolean(this.allowselect)} .selected=${Boolean(this.isChecked)}
        .layout=${this.layout} .dimensions=${this.dimensions || 'm'} .size=${this.size || 's'}
        @nx-card-selection-change=${(e) => this.handleChecked(e.detail)}>
        <div slot="media" class="card-media">
        <a class="card-preview" href="${this.ext === 'link' ? until(href) : href}" tabindex="-1" aria-hidden="true">
          ${this.renderFilePreview()}
        </a>
        ${this._previewError ? html`<span class="preview-error" role="status">${this._previewError}</span>` : nothing}
        </div>
        ${this.isFavorited ? this.renderFavorite('card-favorite', 'overlay-actions') : nothing}
        ${this.rename ? this.renderRename('content') : html`
          <a slot="heading" class=${compact ? 'compact-heading' : ''} href="${this.ext === 'link' ? until(href) : href}" title=${this.name}>
            ${compact ? this.renderIcon() : nothing}<span>${this.name}</span>
          </a>
          ${this.renderCardMenu()}`}
        ${compact ? html`<slot name="metadata" slot="metadata">
          <span class="card-date">${this.renderDate() || 'Date unavailable'}</span>
        </slot>` : html`<span slot="metadata" class="card-type">${getTypeLabel(this.ext)}</span>
          <span slot="metadata" class="card-date">${this.ext === 'link' ? '—' : (this.renderDate() || '—')}</span>`}
      </nx-card>`;
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
      ${this.renderDetailsPopover()}`;
  }

  renderDetailsPopover() {
    const card = this.view === 'card';
    return this._detailsOpen ? html`<nx-popover placement='auto' class="da-item-details" role="dialog" aria-label="Details for ${this.name}" @close=${this.closeDetails}>
        ${card ? html`
          ${this.ext ? html`<section class="card-details" aria-label="Details">
            <h3>Details</h3>${this.renderDetailsContent()}
          </section><hr>` : nothing}
          <button type="button" class="card-favorite-action nx-action-btn-quiet ${this.size === 'm' ? 'nx-btn-lg' : ''}"
          @click=${() => {
            this.requestFavorite();
            this.popover?.close();
            this.closeDetails();
            this.shadowRoot.querySelector('.card-more')?.focus();
          }}>${this.isFavorited ? 'Remove as Favorite' : 'Mark as Favorite'}</button>`
    : this.renderDetailsContent()}
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
    if (this.view === 'preview') return this.renderFilePreview();
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

customElements.define('da-file-item', DaFileItem);
