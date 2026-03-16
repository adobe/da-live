import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../../../../scripts/utils.js';
import getSheet from '../../../../../shared/sheet.js';
import { etcFetch, getAemSiteToken, getSidekickConfig } from '../../../../../shared/utils.js';
import { ICONS, REASONS } from '../utils/constants.js';

await import(`${getNx()}/blocks/loc/views/url-details/url-details.js`);

const sheet = await getSheet(import.meta.url.replace('js', 'css'));

class PreflightLink extends LitElement {
  static properties = {
    details: { attribute: false },
    text: { attribute: false },
    href: { attribute: false },
    _url: { state: true },
    _name: { state: true },
    _parts: { state: true },
    _reason: { state: true },
    _status: { state: true },
    _aemPath: { state: true },
    _open: { state: true },
  };

  constructor() {
    super();
    this._reason = REASONS['link.working'];
  }

  update(props) {
    if (props.has('_reason')) this.reasonUpdated();
    super.update(props);
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.getLinkDetails();
  }

  reasonUpdated() {
    const opts = { bubbles: true, composed: true };
    const event = new CustomEvent('reason', opts);
    this.dispatchEvent(event);
  }

  async normalizeHref(supplied) {
    const { org, site } = this.details;
    const aemOrigin = `https://main--${site}--${org}.aem.live`;

    // Path only — build full AEM URL
    const href = supplied.startsWith('/')
      ? `${aemOrigin}${supplied}`
      : supplied;

    const url = new URL(href);
    const path = url.pathname;

    // Already an AEM URL — rebuild with correct org/site
    if (url.hostname.includes('.aem.')) {
      return new URL(`${aemOrigin}${path}`);
    }

    // Production URL — check if hostname matches sidekick config
    try {
      const { host } = await getSidekickConfig({ org, site });
      const prod = host;
      if (url.hostname === prod) {
        return new URL(`${aemOrigin}${path}`);
      }
    } catch {
      // Do nothing, could not get SK config
    }

    // External link — no match
    url.external = true;
    return url;
  }

  convertAemPath() {
    const { org, site } = this.details;
    return `/${org}/${site}${this._url.pathname}`;
  }

  async getSiteTokenHeaders() {
    const { org, site } = this.details;
    const json = await getAemSiteToken({ org, site });
    const { siteToken } = json;
    if (!siteToken) return null;
    return { Authorization: `token ${siteToken}` };
  }

  async checkLink(url) {
    try {
      const opts = { method: 'HEAD', redirect: 'manual' };
      if (!url.external) {
        const headers = await this.getSiteTokenHeaders();
        if (headers) opts.headers = headers;
      }
      const noCacheUrl = `${url.href}?nocache=${Date.now()}`;
      const resp = await etcFetch(noCacheUrl, 'cors', opts);
      // redirect: manual will return 0 as the status code
      this._status = resp.status || 301;
      if (resp.status === 0) return REASONS['link.warn'];
      if (resp.ok) return REASONS['link.success'];
      return REASONS['link.error'];
    } catch {
      return REASONS['link.error'];
    }
  }

  getName() {
    const lastSegment = this._parts.at(-1);
    if (this.text === this.href || this.text.startsWith('https://')) {
      return lastSegment;
    }
    return this.text || this._parts.at(-1);
  }

  async getLinkDetails() {
    this._url = await this.normalizeHref(this.href);
    this._parts = this._url.pathname.slice(1).split('/');
    this._name = this.getName();
    this._reason = await this.checkLink(this._url);
    if (!this._url.external) {
      this._aemPath = this.convertAemPath();
    }
  }

  handleOpen() {
    this._open = !this._open;
  }

  get badge() {
    return this._reason.badge;
  }

  get reason() {
    return this._reason.reason;
  }

  renderExpand() {
    if (!this._aemPath) return nothing;
    return html`
      <button aria-label="expand" class="expand-link" @click=${this.handleOpen}>
        <svg class="icon" viewBox="0 0 20 20"><use href="${ICONS.get('more')}"/></svg>
      </button>`;
  }

  renderLinkPath() {
    if (!this._aemPath) return this._url.href;
    return html`/${this._parts.join('/')}`;
  }

  renderAemDetails() {
    if (!this._open) return nothing;
    return html`
      <div class="link-item-details">
        <nx-loc-url-details .path=${this._aemPath}></nx-loc-url-details>
      </div>
    `;
  }

  render() {
    if (!this._url) return nothing;

    return html`
      <div class="link-item ${this._open ? 'is-open' : ''}">
        <div class="link-item-header">
          <a href="${this._url.href}" class="link-item-header-title" target="_blank">
            <p class="link-name">${this._name}</p>
            <p class="link-path">${this.renderLinkPath()}</p>
          </a>
          ${this.renderExpand()}
          <pf-label .badge=${this._reason.badge} .text=${this._status} .icon=${this._status ? nothing : ICONS.get('more')}></pf-label>
        </div>
        ${this.renderAemDetails()}
      </div>
    `;
  }
}

customElements.define('pf-link', PreflightLink);
