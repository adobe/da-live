import { LitElement, html } from '../../../deps/lit/lit-all.min.js';

import getSheet from '../../shared/sheet.js';
const sheet = await getSheet('/blocks/edit/da-preview/da-preview.css');

const SIZES = {
  mobile: '375px',
  tablet: '899px',
  laptop: '1280px',
  desktop: '1440px',
}

const MOCK_BODY = `
<body>
  <main>
      <div>
          <p>
              <picture>
                  <source type="image/webp" srcset="https://main--milo--adobecom.hlx.page/media_19c81388059a2e8011db74d56f43389417cd1c887.png" media="(min-width: 600px)">
                  <source type="image/webp" srcset="https://main--milo--adobecom.hlx.page/media_19c81388059a2e8011db74d56f43389417cd1c887.png">
                  <source type="image/png" srcset="https://main--milo--adobecom.hlx.page/media_19c81388059a2e8011db74d56f43389417cd1c887.png" media="(min-width: 600px)">
                  <img loading="lazy" alt="" src="https://main--milo--adobecom.hlx.page/media_19c81388059a2e8011db74d56f43389417cd1c887.png" width="1369" height="685">
              </picture>
          </p>
          <p>
              This content was dynamically synced between two web components into an iframe using MessageChannel and PostMessage APIs.
          </p>
      </div>
  </main>
</body>
`;

export default class DaPreview extends LitElement {
  static properties = {
    path: {},
    width: { state: true },
    body: { state: true },
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

  setBody() {
    console.log('setting body');
    this.port1.postMessage({ set: 'body', body: this.body, get: 'height' });
  }

  iframeLoaded() {
    this.port1.onmessage = (e) => { this.setHeight(e.data); };
    setTimeout(() => {
      this.iframe.contentWindow.postMessage({ init: true }, '*', [this.channel.port2]);
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

    props.forEach((oldValue, propName) => {
      if (propName === 'body') {
        this.setBody();
      }
    });
  }
}

customElements.define('da-preview', DaPreview);
