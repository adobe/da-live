import { LitElement, html, map } from '../../deps/lit/lit-all.min.js';
import sheet from './das-sites.css' assert { type: 'css' };
import { origin } from '../shared/constants.js';
import './site.js';

export class Sites extends LitElement {
  static properties = {
    sites: { state: true },
    fetched: { state: true },
  };

  constructor() {
    super();
    this.sites = [];
    this.fetched = false;
  }

  async getContent() {
    const resp = await fetch(`${origin}/api/list?pathname=/sites`);
    const json = await resp.json();
    this.sites = json;
    this.fetched = true;
  }

  connectedCallback() {
    super.connectedCallback();
    this.getContent();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  render() {
    return html`
      ${map(this.sites, (item) => html`<das-site role="listitem" tabindex="0" name=${item.name}></das-site>`)}
      ${this.fetched ? html`<das-site role="listitem" tabindex="0" name=add></das-site>` : ``}
    `;
  }
}

customElements.define('das-sites', Sites);

export default function init(el) {
  const sites = document.createElement('das-sites');
  sites.setAttribute('role', 'list');
  el.append(sites);
}
