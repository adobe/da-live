import { LitElement, html } from '../../../deps/lit/lit-core.min.js';
import { origin } from '../shared/constants.js';

import getSheet from '../shared/sheet.js';
const sheet = await getSheet('/blocks/sites/sites.css');

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
    const resp = await fetch(`${origin}/.1.json`);
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
    return html`<div class="nothing"></div>`;
    // return html`
    //   ${map(this.sites, (item) => html`<das-site role="listitem" tabindex="0" name=${item.name}></das-site>`)}
    //   ${this.fetched ? html`<das-site role="listitem" tabindex="0" name=add></das-site>` : ``}
    // `;
  }
}

customElements.define('das-sites', Sites);

export default function init(el) {
  const sites = document.createElement('das-sites');
  sites.setAttribute('role', 'list');
  el.append(sites);
}
