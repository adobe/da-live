import { LitElement, html } from '../../../deps/lit/lit-all.min.js';
import sheet from './da-preview.css' assert { type: 'css' };

const SIZES = {
  mobile: '375px',
  tablet: '899px',
  laptop: '1201px',
  desktop: '100%',
}

export default class DaPreview extends LitElement {
  static properties = {
    path: {},
    width: { state: true },
  };

  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  setView(size) {
    const iframe = this.shadowRoot.querySelector('iframe');
    iframe.style.width = SIZES[size];
  }

  render() {
    return html`
      <div class="da-preview-menubar">
        ${Object.keys(SIZES).map((key) => {
          return html`<span class="da-preview-menuitem set-${key}" @click=${() => { this.setView(key) }}></span>`;
        })}
      </div>
      <iframe src="https://main--dac--auniverseaway.hlx.page${this.path}?martech=off">
    `;
  }
}

customElements.define('da-preview', DaPreview);
