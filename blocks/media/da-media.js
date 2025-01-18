import { LitElement, html } from 'da-lit';
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

  get _mediaType() {
    const ext = this.details.name.split('.').pop();
    return ext;
  }

  render() {
    if (this._mediaType === 'mp4') {
      return html`
        <div class="da-content">
          <video controls>
            <source src="${this.details.contentUrl}" type="video/mp4" />
          </video>
        </div>
      `;
    }

    if (this._mediaType === 'pdf') {
      return html`
        <div class="da-content">
          I'm a PDF
        </div>
      `;
    }

    return html`
      <div class="da-content">
        <img src="${this.details.contentUrl}" width="900" height="600" />
      </div>
    `;
  }
}

customElements.define('da-media', DaMedia);
