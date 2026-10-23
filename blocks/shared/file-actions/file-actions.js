import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import { fetchAemStatus, fetchDaStatus } from '../../browse/shared/item.js';
import { ICONS } from '../icons.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
await import(`${getNx()}/blocks/shared/popover/popover.js`);
const styles = await Promise.all([
  loadStyle(`${getNx2()}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);

export default class DaFileActions extends LitElement {
  static properties = {
    path: {},
    name: {},
    ext: {},
    view: {},
    isFavorited: { type: Boolean },
    _open: { state: true },
    _status: { state: true },
    _aem: { state: true },
    _error: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = styles;
  }

  disconnectedCallback() {
    this.close();
    super.disconnectedCallback();
  }

  willUpdate(changed) {
    if (changed.has('path')) this.close();
  }

  get popover() {
    return this.shadowRoot.querySelector('nx-popover');
  }

  close = () => {
    this._request?.abort();
    this._open = false;
    this._status = undefined;
    this._aem = undefined;
    this._error = undefined;
  };

  async loadDetails() {
    this._request?.abort();
    const request = new AbortController();
    this._request = request;
    this._status = undefined;
    this._aem = undefined;
    this._error = undefined;
    const results = await Promise.allSettled([fetchDaStatus(this), fetchAemStatus(this)]);
    if (request.signal.aborted || !this.isConnected) return;
    const [status, aem] = results;
    this._status = status.status === 'fulfilled' ? status.value : null;
    this._aem = aem.status === 'fulfilled' ? aem.value : null;
    if (!this._status || !this._aem) this._error = 'Some file details could not be loaded.';
  }

  async toggleDetails({ currentTarget }) {
    if (this._open) {
      this.popover?.close();
      this.close();
      return;
    }
    this._open = true;
    const loading = this.ext && this.ext !== 'link' ? this.loadDetails() : Promise.resolve();
    await this.updateComplete;
    if (this._open) this.popover?.show({ anchor: currentTarget, placement: 'auto' });
    await loading;
  }

  favorite() {
    this.dispatchEvent(new CustomEvent('favoritechange', { bubbles: true, composed: true }));
    if (this.view === 'card') {
      this.popover?.close();
      this.close();
      this.shadowRoot.querySelector('.details-trigger')?.focus();
    }
  }

  renderDate(status, fallback) {
    if (!this._aem && !this._error) return 'Loading...';
    if (!status) return 'Unavailable';
    if (status.status === 401 || status.status === 403) return 'Not authorized';
    if (!status.lastModified) return fallback;
    return `${status.lastModified.date} ${status.lastModified.time}`;
  }

  renderEnvironment(label, status, fallback) {
    const date = this.renderDate(status, fallback);
    return html`<div class="detail">
      <span>${label}</span>
      ${status?.url ? html`<a href=${status.redirect || status.url} target="_blank"
        rel="noopener noreferrer" aria-label=${`${label} ${this.name}: ${date}`}>${date}</a>` : html`<span>${date}</span>`}
    </div>`;
  }

  render() {
    const card = this.view === 'card';
    const favoriteLabel = this.isFavorited ? 'Remove as Favorite' : 'Mark as Favorite';
    const favoriteIcon = this.isFavorited ? ICONS.favorite : '/img/icons/s2-icon-star-20-n.svg';
    return html`
      <button class="details-trigger nx-action-btn-icon" type="button"
        aria-label=${`${card ? 'More options' : 'File information'} for ${this.name}`}
        aria-haspopup="dialog" aria-expanded=${!!this._open} @click=${this.toggleDetails}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><use
          href="/img/icons/${card ? 's2-icon-more-20-n' : 's2-icon-infocircle-20-n'}.svg#icon"></use></svg>
      </button>
      ${!card ? html`<button class="favorite nx-action-btn-icon" type="button"
        aria-label=${`${favoriteLabel}: ${this.name}`} aria-pressed=${!!this.isFavorited}
        @click=${this.favorite}><svg viewBox="0 0 20 20" aria-hidden="true">
          <use href="${favoriteIcon}#icon"></use></svg></button>` : nothing}
      ${this._open ? html`<nx-popover role="dialog" aria-label=${`Details for ${this.name}`} @close=${this.close}>
        ${this.ext && this.ext !== 'link' ? html`<section aria-label="Detail Information">
          <h3>Detail Information</h3>
          <div class="detail"><span>Version</span>
            <span>${this._status?.version ?? (this._status === undefined && !this._error ? 'Loading...' : 'Unavailable')}</span></div>
          <div class="detail"><span>Modified by</span>
            <span>${this._status?.lastModifiedBy || (this._status === undefined && !this._error ? 'Loading...' : 'Unavailable')}</span></div>
          ${this.renderEnvironment('Previewed', this._aem?.preview, 'Not previewed')}
          ${this.renderEnvironment('Published', this._aem?.live, 'Not published')}
          ${this._error ? html`<p role="status">${this._error}
            <button type="button" class="nx-action-btn-quiet" @click=${this.loadDetails}>Try again</button></p>` : nothing}
        </section>` : nothing}
        ${card ? html`<button class="favorite-action nx-action-btn-quiet" type="button"
          aria-label=${`${favoriteLabel}: ${this.name}`} @click=${this.favorite}>
          <span>${favoriteLabel}</span><svg viewBox="0 0 20 20" aria-hidden="true">
            <use href="${favoriteIcon}#icon"></use></svg></button>` : nothing}
      </nx-popover>` : nothing}`;
  }
}

customElements.define('da-file-actions', DaFileActions);
