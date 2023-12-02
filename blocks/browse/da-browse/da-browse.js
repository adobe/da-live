import { LitElement, html, map } from '../../../deps/lit/lit-all.min.js';

import getSheet from '../../shared/sheet.js';
const sheet = await getSheet('/blocks/browse/da-browse/da-browse.css');

export default class DaBrowse extends LitElement {
  static properties = {
    details: { attribute: false },
  };

  constructor() {
    super();
  }

  async getList() {
    const resp = await fetch(``)
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.getList();
  }

  render() {
    return html`
      <h1>Browse</h1>
      
    `;
  }
}

customElements.define('da-browse', DaBrowse);
