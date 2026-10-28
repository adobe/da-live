import { LitElement, html } from 'da-lit';
import { getNx } from '../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const styles = await loadStyle(import.meta.url);

export default class DaLandingTile extends LitElement {
  static properties = {
    heading: {},
    description: {},
    iconHref: {},
    tone: {},
    href: {},
    size: { reflect: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  render() {
    const content = html`
      <span class="icon ${this.tone || ''}" aria-hidden="true"
        style="--tile-icon: url('${this.iconHref}')"></span>
      <div class="content"><h3>${this.heading}</h3><p>${this.description}</p></div>`;
    return this.href
      ? html`<a class="tile" href=${this.href}>${content}</a>`
      : html`<div class="tile">${content}</div>`;
  }
}

customElements.define('da-landing-tile', DaLandingTile);
