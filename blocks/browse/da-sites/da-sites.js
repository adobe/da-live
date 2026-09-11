import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const styles = await loadStyle(import.meta.url);
await import(`${getNx()}/blocks/shared/menu/menu.js`);

const THUMB_COUNT = 6;

function thumbIndex(name) {
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) sum += name.charCodeAt(i);
  return sum % THUMB_COUNT;
}

export default class DaSites extends LitElement {
  static properties = {
    _recents: { state: true },
    _status: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this._recents = this.getRecents();
  }

  getRecents() {
    const recentSites = JSON.parse(localStorage.getItem('da-sites')) || [];
    if (recentSites.length > 0) {
      return recentSites.map((name) => ({
        name,
        style: `da-thumb-${thumbIndex(name)}`,
      }));
    }
    return null;
  }

  setStatus(text, description, type = 'info') {
    this._status = text ? { type, text, description } : null;
  }

  handleRemove(site) {
    // Get the index of the site to remove
    const idx = this._recents.findIndex((recent) => recent.name === site.name);
    // Remove it from UI
    this._recents.splice(idx, 1);
    this.requestUpdate();
    // Get the localstorage sites
    const localSites = JSON.parse(localStorage.getItem('da-sites')) || [];
    // Remove it from the local store
    localSites.splice(idx, 1);
    localStorage.setItem('da-sites', JSON.stringify(localSites));
  }

  handleMenuSelect(e, site) {
    const { id } = e.detail;
    if (id === 'share') this.handleShare(site.name);
    if (id === 'hide') this.handleRemove(site);
  }

  handleShare(site) {
    const blob = new Blob([`${window.location.origin}/#/${site}`], { type: 'text/plain' });
    const data = [new ClipboardItem({ [blob.type]: blob })];
    navigator.clipboard.write(data);

    this.setStatus('Copied', 'The link was copied to the clipboard.');
    setTimeout(() => { this.setStatus(); }, 3000);
  }

  renderStatus() {
    return html`
      <div class="da-list-status">
        <div class="da-list-status-toast da-list-status-type-${this._status.type}">
          <p class="da-list-status-title">${this._status.text}</p>
          ${this._status.description ? html`<p class="da-list-status-description">${this._status.description}</p>` : nothing}
        </div>
      </div>`;
  }

  renderSite(site) {
    const [orgName, siteName] = site.name.split('/');
    const projectLabel = siteName || orgName;
    const workspaceLabel = siteName ? orgName : '';
    return html`
      <li class="da-site-outer">
        <div class="da-site">
          <a class="da-site-thumb ${site.style}" href="#/${site.name}">
            <div class="da-site-thumb-fade"></div>
            <div class="da-site-meta">
              <span class="da-site-name">${projectLabel}</span>
              ${workspaceLabel ? html`<span class="da-site-workspace">${workspaceLabel}</span>` : nothing}
            </div>
          </a>
          <div class="da-site-footer">
            <nx-menu
              .items=${[{ id: 'share', label: 'Share' }, { id: 'hide', label: 'Hide' }]}
              @select=${(e) => this.handleMenuSelect(e, site)}>
              <button slot="trigger" class="da-site-menu-btn" aria-label="More options">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
                  <path fill="currentColor" d="M16,17.51c.83,0,1.5-.67,1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5,1.5.67,1.5,1.5,1.5Z" />
                  <path fill="currentColor" d="M10,17.51c.83,0,1.5-.67,1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5,1.5.67,1.5,1.5,1.5Z" />
                  <path fill="currentColor" d="M22,17.51c.83,0,1.5-.67,1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5,1.5.67,1.5,1.5,1.5Z" />
                </svg>
              </button>
            </nx-menu>
          </div>
        </div>
      </li>
    `;
  }

  renderHeader() {
    return html`
      <div class="da-sites-header">
        <div class="da-sites-title">
          <span class="da-sites-title-icon" aria-hidden="true"></span>
          <h2>Your sites</h2>
        </div>
        <div class="da-sites-actions">
          <button type="button" class="da-sites-action da-sites-action-icon is-selected" aria-label="Grid view">
            <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-viewgrid-20-n.svg#icon"></use></svg>
          </button>
          <button type="button" class="da-sites-action da-sites-action-icon" aria-label="List view">
            <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-viewlist-20-n.svg#icon"></use></svg>
          </button>
          <button type="button" class="da-sites-action" aria-label="Show active projects">
            <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-filter-20-n.svg#icon"></use></svg>
            <span>Show <span class="da-sites-action-value">Active projects</span></span>
          </button>
          <button type="button" class="da-sites-action" aria-label="Sorted by last modified">
            <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-sort-20-n.svg#icon"></use></svg>
            <span>Sorted by <span class="da-sites-action-value">Last modified</span></span>
          </button>
          <a class="da-sites-action da-sites-action-accent" href="/start">
            <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-addcircle-20-n.svg#icon"></use></svg>
            <span>New Project</span>
          </a>
          <button type="button" class="da-sites-action da-sites-action-icon" aria-label="More options">
            <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-more-20-n.svg#icon"></use></svg>
          </button>
        </div>
      </div>
    `;
  }

  renderNewTile() {
    return html`
      <li class="da-site-new">
        <a class="da-site-new-card" href="/start">
          <span class="da-site-new-icon">
            <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-addcircle-20-n.svg#icon"></use></svg>
          </span>
          <span class="da-site-new-label">New project</span>
        </a>
      </li>
    `;
  }

  render() {
    return html`
      ${this.renderHeader()}
      <ul class="da-sites-list">
        ${this._recents?.length ? this._recents.map((site) => this.renderSite(site)) : nothing}
        ${this.renderNewTile()}
      </ul>
      ${this._status ? this.renderStatus() : nothing}
    `;
  }
}

customElements.define('da-sites', DaSites);
