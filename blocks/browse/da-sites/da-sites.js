import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../shared/sheet.js';

const sheet = await getSheet('/blocks/browse/da-sites/da-sites.css');

const RANDOM_MAX = 8;

function getRandom() {
  return Math.floor(Math.random() * RANDOM_MAX);
}

export default class DaSites extends LitElement {
  static properties = {
    _recents: { state: true },
    _status: { state: true },
    _urlError: { state: true },
  };

  constructor() {
    super();
    this._urlError = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.getRecents();
  }

  mapRecentSites(recentSites) {
    this._recents = recentSites.map((name) => (
      {
        name,
        img: `/blocks/browse/da-sites/img/cards/da-${getRandom()}.jpg`,
        style: `da-card-style-${getRandom()}`,
      }
    ));
  }

  mapRecentOrgs(recentOrgs) {
    this._recents = recentOrgs.map((name) => (
      {
        name,
        img: `/blocks/browse/da-sites/img/cards/da-${getRandom()}.jpg`,
        style: `da-card-style-${getRandom()}`,
      }
    ));
  }

  getRecents() {
    const recentSites = JSON.parse(localStorage.getItem('da-sites')) || [];
    const recentOrgs = JSON.parse(localStorage.getItem('da-orgs')) || [];

    if (recentSites.length > 0) {
      this.mapRecentSites(recentSites);
      localStorage.removeItem('da-orgs');
    } else if (recentOrgs.length > 0) {
      this.mapRecentOrgs(recentOrgs);
    }
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

  handleFlip(e, site) {
    e.preventDefault();
    e.stopPropagation();
    site.flipped = !site.flipped;
    this.requestUpdate();
  }

  parseSubdomain(siteUrl) {
    try {
      const url = new URL(siteUrl);
      if (!url.hostname.match(/hlx\.live$|aem\.live$|hlx\.page$|aem\.page$/)) {
        return null;
      }
      const helixString = url.hostname.split('.')[0];
      if (!helixString) return null;
      // eslint-disable-next-line no-unused-vars
      const [_, repo, org] = helixString.split('--');
      if (!repo || !org) return null;
      return `#/${org}/${repo}`;
    } catch (_) {
      return null;
    }
  }

  async handleGo(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const { siteUrl } = Object.fromEntries(formData);
    if (!siteUrl) return;
    const result = this.parseSubdomain(siteUrl);
    if (result) {
      window.location = result;
    } else {
      this._urlError = true;
    }
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

  renderGo() {
    return html`
      <form @submit=${this.handleGo}>
        <input 
            @keydown="${() => { this._urlError = false; }}"
            @change="${() => { this._urlError = false; }}" 
            type="text" name="siteUrl" 
            placeholder="https://main--site--org.aem.page" 
            class="${this._urlError ? 'error' : nothing}" 
        />
        <div class="da-form-btn-offset">
          <button aria-label="Go to site">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26">
              <path fill="currentColor"
                d="M23.09,13.67c.14-.35.14-.74,0-1.08-.07-.17-.18-.33-.31-.46l-6.62-6.62c-.55-.55-1.45-.55-2,0-.55.55-.55,1.45,0,2l4.21,4.21H4.61c-.78,0-1.41.63-1.41,1.42s.63,1.42,1.41,1.42h13.76l-4.21,4.21c-.55.55-.55,1.45,0,2,.28.28.64.41,1,.41s.72-.14,1-.41l6.62-6.62c.13-.13.23-.29.31-.46Z" />
            </svg>
          </button>
        </div>
      </form>
    `;
  }

  renderSite(site) {
    return html`
      <li class="da-site-outer">
        <div class="da-site ${site.flipped ? 'is-flipped' : ''}">
          <div class="da-site-front">
            <picture>
              <img src="${site.img}" width="480" height="672" alt="" />
            </picture>
            <div class="bg-overlay ${site.style}">
              <a href="#/${site.name}">
                <span>${site.name.split('/')[1]}</span>
                <span>${site.name.split('/')[0]}</span>
                <span class="da-site-card-action da-site-card-action-go">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
                      <path fill="currentColor" d="M22.91,16.38c.1-.24.1-.51,0-.76-.05-.12-.12-.23-.21-.32l-4.63-4.63c-.39-.39-1.01-.39-1.4,0-.39.39-.39,1.01,0,1.4l2.94,2.94h-9.62c-.55,0-.99.44-.99.99s.44.99.99.99h9.62l-2.94,2.94c-.39.39-.39,1.01,0,1.4.19.19.45.29.7.29s.51-.1.7-.29l4.63-4.63c.09-.09.16-.2.21-.32Z" />
                  </svg>
                </span>
              </a>
            </div>
          </div>
          <div class="da-site-back">
            <button class="da-back-action" @click=${() => this.handleShare(site.name)}>
              <img src="/blocks/browse/da-sites/img/s2-share.svg" loading="lazy"/>
              <span>Share</span>
            </button>
            <button class="da-back-action" @click=${() => this.handleRemove(site)}>
              <img src="/blocks/browse/da-sites/img/s2-visibility-off.svg" loading="lazy"/>
              <span>Hide</span>
            </button>
          </div>
          <button class="da-site-card-action da-site-card-action-more" @click=${(e) => this.handleFlip(e, site)}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
                <path fill="currentColor" d="M16,17.51c.83,0,1.5-.67,1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5,1.5.67,1.5,1.5,1.5Z" />
                <path fill="currentColor" d="M10,17.51c.83,0,1.5-.67,1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5,1.5.67,1.5,1.5,1.5Z" />
                <path fill="currentColor" d="M22,17.51c.83,0,1.5-.67,1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5,1.5.67,1.5,1.5,1.5Z" />
            </svg>
          </button>
        </div>
      </li>
    `;
  }

  renderSites(sites) {
    return html`
      <ul class="da-sites-list">${sites.map((site) => this.renderSite(site))}</ul>
    `;
  }

  renderEmpty() {
    return html`
      <div class="da-no-site-well">
        <img src="/blocks/browse/da-sites/img/site-icon-color.svg" width="78" height="60" alt=""/>
        <div class="da-no-site-text">
          <h3>You don’t have any recent sites.</h3>
          <p>Enter the URL for your site to get started.</p>
        </div>
        ${this.renderGo()}
      </div>
    `;
  }

  render() {
    return html`
      <img src="/blocks/browse/da-sites/img/bg-gradient-org.avif" class="da-site-bg" alt="" />
      <div class="da-site-container">
        <div class="da-site-header">
          <h2>Recents</h2>
        </div>
        ${this._recents && this._recents.length > 0 ? this.renderSites(this._recents) : this.renderEmpty()}
        <div class="da-site-header">
          <h2>Sites</h2>
          ${this._recents && this._recents.length > 0 ? this.renderGo() : nothing}
        </div>
        <div class="da-site-sandbox-new">
          <a class="da-double-card da-double-card-sandbox" href="#/aem-sandbox/block-collection">
            <picture>
              <img class="da-double-card-bg" src="/blocks/browse/da-sites/img/bg-sandbox-card.avif" width="800" height="534" alt="" />
            </picture>
            <div class="da-double-card-fg">
              <img src="/blocks/browse/da-sites/img/sandbox-icon-gray.svg" width="80" height="60" alt=""/>
              <h3>Sandbox</h3>
            </div>
          </a>
          <a class="da-double-card da-double-card-add-new" href="/start">
            <picture>
              <img class="da-double-card-bg" src="/blocks/browse/da-sites/img/bg-new-card.avif" width="800" height="546" alt="" />
            </picture>
            <div class="da-double-card-fg">
              <img src="/blocks/browse/da-sites/img/add-new-icon-gray.svg" width="80" height="60" alt=""/>
              <h3>Add new</h3>
            </div>
          </a>
        </div>
      </div>
      ${this._status ? this.renderStatus() : nothing}
    `;
  }
}

customElements.define('da-sites', DaSites);
