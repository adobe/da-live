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
    action: { type: Boolean },
    disabled: { type: Boolean },
    size: { reflect: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  _renderSurface() {
    const content = html`
      <span class="icon ${['green', 'orange', 'purple'].includes(this.tone)
        ? this.tone : 'turquoise'}" aria-hidden="true"
        style="--tile-icon: url('${this.iconHref}')"></span>
      <div class="content">
        <h3>${this.heading}</h3>
        <p>${this.description}</p>
      </div>`;
    if (this.href) return html`<a class="tile" href=${this.href}>${content}</a>`;
    if (this.action) {
      return html`<button class="tile" type="button"
        ?disabled=${this.disabled}>${content}</button>`;
    }
    return html`<div class="tile">${content}</div>`;
  }

  render() {
    return html`<div class="tile-container">${this._renderSurface()}</div>`;
  }
}

customElements.define('da-landing-tile', DaLandingTile);
