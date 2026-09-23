import { html, nothing } from 'da-lit';
import { getNx } from '../../../../../../../../scripts/utils.js';
import getSheet from '../../../../../../../shared/sheet.js';
import { etcFetch, getAemSiteToken, getSidekickConfig } from '../../../../../../../shared/utils.js';
import PreflightResult, { SEVERITY } from '../../../views/result.js';

await import(`${getNx()}/blocks/loc/views/url-details/url-details.js`);

const sheet = await getSheet(import.meta.url.replace('js', 'css'));
const MORE_ICON = '/blocks/edit/img/S2_Icon_More_20_N.svg#S2_Icon_More';

class PreflightLink extends PreflightResult {
  static properties = {
    context: { attribute: false },
    text: { attribute: false },
    href: { attribute: false },
    _url: { state: true },
    _name: { state: true },
    _parts: { state: true },
    _httpStatus: { state: true },
    _aemPath: { state: true },
    _open: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  async normalizeHref(supplied) {
    const { org, site } = this.context;
    const aemOrigin = `https://main--${site}--${org}.aem.live`;

    const href = supplied.startsWith('/')
      ? `${aemOrigin}${supplied}`
      : supplied;

    const url = new URL(href);
    const path = url.pathname;

    if (url.hostname.includes('.aem.')) {
      return new URL(`${aemOrigin}${path}`);
    }

    try {
      const { host } = await getSidekickConfig({ org, site });
      if (url.hostname === host) {
        return new URL(`${aemOrigin}${path}`);
      }
    } catch {
      // Do nothing, could not get SK config
    }

    url.external = true;
    return url;
  }

  convertAemPath() {
    const { org, site } = this.context;
    return `/${org}/${site}${this._url.pathname}`;
  }

  async getSiteTokenHeaders() {
    const { org, site } = this.context;
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
      this._httpStatus = resp.status || 301;
      if (resp.status === 0) return [SEVERITY.WARN, 'Link redirected'];
      if (resp.ok) return [SEVERITY.SUCCESS, 'Link published'];
      return [SEVERITY.ERROR, 'Could not validate link'];
    } catch {
      return [SEVERITY.ERROR, 'Could not validate link'];
    }
  }

  getName() {
    const lastSegment = this._parts.at(-1);
    if (this.text === this.href || this.text.startsWith('https://')) {
      return lastSegment;
    }
    return this.text || this._parts.at(-1);
  }

  async runCheck() {
    try {
      this._url = await this.normalizeHref(this.href);
      this._parts = this._url.pathname.slice(1).split('/');
      this._name = this.getName();
      const [result, reason] = await this.checkLink(this._url);
      if (!this._url.external) this._aemPath = this.convertAemPath();
      this.settle(result, reason);
    } catch {
      this.settle(SEVERITY.ERROR, 'Could not validate link');
    }
  }

  // stopPropagation on this and the title link below -- a click composes across the shadow
  // boundary into an ancestor .pfr-entry.is-locatable (see preflight-results.js), and this
  // element's own action (expand / open the link) should be the only thing that happens.
  handleOpen(e) {
    e.stopPropagation();
    this._open = !this._open;
  }

  renderExpand() {
    if (!this._aemPath) return nothing;
    return html`
      <button aria-label="expand" class="expand-link" @click=${this.handleOpen}>
        <svg class="icon" viewBox="0 0 20 20"><use href="${MORE_ICON}"/></svg>
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
          <a
            href="${this._url.href}"
            class="link-item-header-title"
            target="_blank"
            rel="noopener noreferrer"
            @click=${(e) => e.stopPropagation()}>
            <p class="link-name">${this._name}</p>
            <p class="link-path">${this.renderLinkPath()}</p>
          </a>
          ${this.renderExpand()}
          <pf-label
            .badge=${this.result}
            .text=${this._httpStatus}
            .icon=${this._httpStatus ? nothing : MORE_ICON}>
          </pf-label>
        </div>
        ${this.renderAemDetails()}
      </div>
    `;
  }
}

customElements.define('pf-link', PreflightLink);
