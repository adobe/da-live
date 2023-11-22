import { LitElement, html } from '../../../deps/lit/lit-all.min.js';
import sheet from './da-preview.css' assert { type: 'css' };

const SIZES = {
  mobile: '375px',
  tablet: '899px',
  laptop: '1280px',
  desktop: '1440px',
}

export default class DaPreview extends LitElement {
  static properties = {
    path: {},
    width: { state: true },
  };

  constructor() {
    super();
    this.channel = new MessageChannel();
    this.port1 = this.channel.port1;
    this.parent = document.querySelector('da-content');
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  hidePreview() {
    this.parent.classList.remove('show-preview');
    this.classList.remove('show-preview');
  }

  setHeight(size) {
    this.iframe.style.height = size;
  }

  setWidth(size) {
    this.iframe.style.width = SIZES[size];
    this.port1.postMessage({ get: 'height' });
  }

  iframeLoaded() {
    this.port1.onmessage = (e) => { this.setHeight(e.data); };
    this.iframe.contentWindow.postMessage({ init: true }, '*', [this.channel.port2]);
    setTimeout(() => {
      this.setWidth('mobile');
    }, 2000);
  }

  render() {
    return html`
      <div class="da-preview-menubar">
        ${Object.keys(SIZES).map((key) => {
          return html`
            <span
              class="da-preview-menuitem set-${key}"
              @click=${() => { this.setWidth(key) }}>
            </span>`;
        })}
        <span class="da-preview-menuitem" @click=${this.hidePreview}></span>
      </div>
      <iframe src="${this.path}?martech=off&dapreview=on" scrolling="no">
    `;
  }

  updated(props) {
    super.updated(props);
    this.iframe = this.shadowRoot.querySelector('iframe');
    if (this.iframe) {
      this.iframe.addEventListener('load', () => this.iframeLoaded());
    }
  }
}

customElements.define('da-preview', DaPreview);
