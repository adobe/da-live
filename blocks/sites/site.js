import { LitElement, html } from '../../deps/lit/lit-all.min.js';
import sheet from './das-site.css' assert { type: 'css' };

export class Site extends LitElement {
  static properties = {
    name: { type: String },
  };

  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback();
    this.renderRoot.adoptedStyleSheets = [sheet];
  }

  render() {
    return html`${this.name}`;
  }
}

customElements.define('das-site', Site);
