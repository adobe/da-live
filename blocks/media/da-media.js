import { LitElement, html } from '../../deps/lit/lit-core.min.js';
import { getNx } from '../../../scripts/utils.js';

// Styles
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const STYLE = await getStyle(import.meta.url);

class DaMedia extends LitElement {
  static properties = {};

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [STYLE];
    document.title = `View ${this.details.name} - Dark Alley`;
  }

  render() {
    return html`
      <div class="da-content">
        <img src="${this.details.contentUrl}" width="900" height="600" />
      </div>
    `;
  }
}

customElements.define('da-media', DaMedia);
