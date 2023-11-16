import { LitElement, html, map } from '../../deps/lit/lit-all.min.js';
import sheet from './das-sites.css' assert { type: 'css' };
import './site.js';

export class Sites extends LitElement {
  static properties = {
    sites: { state: true },
  };

  constructor() {
    super();
    this.sites = [
      { name: 'Milo' },
      { name: 'BACOM' },
      { name: 'Blog' },
      { name: 'DC' },
      { name: 'CC' },
      { name: 'Homepage' },
      { name: 'Stock' },
      { name: 'HelpX' },
    ];
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  render() {
    return html`
      ${map(this.sites, (item) => html`<das-site role="listitem" tabindex="0" name=${item.name}></das-site>`)}
    `;
  }
}

customElements.define('das-sites', Sites);

export default function init(el) {
  const sites = document.createElement('das-sites');
  sites.setAttribute('role', 'list');
  el.append(sites);
}
