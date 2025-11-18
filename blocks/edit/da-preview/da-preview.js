import { LitElement, html } from 'da-lit';

import getSheet from '../../shared/sheet.js';

const sheet = await getSheet('/blocks/edit/da-preview/da-preview.css');

const SIZES = {
  mobile: '375px',
  tablet: '899px',
  laptop: '1280px',
  desktop: '1440px',
};

export default class DaPreview extends LitElement {
  static properties = {
    path: {},
    width: { state: true },
    body: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  getEnv() {
    const { hostname } = window.location;
    if (hostname.includes('local')) return 'local';
    return 'on';
  }

  formatPath(path) {
    return path.endsWith('index') ? path.substring(0, path.lastIndexOf('/') + 1) : path;
  }

  showPreview(callback) {
    const src = this.iframe.getAttribute('src');

    const show = () => {
      callback();
      // leave a small delay to allow the body replacement to complete
      setTimeout(() => {
        this.classList.add('show-preview');
        this._daContent.classList.add('show-preview');
      }, 500);
    };

    if (!src) {
      this.onFrameLoaded = show;
      this.iframe.src = `${this.formatPath(this.path)}?martech=off&dapreview=${this.getEnv()}`;
    } else {
      show();
    }
  }

  hidePreview() {
    this._daContent.classList.remove('show-preview');
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
    this.port1.postMessage({ set: 'body', get: 'height', body: this.body });
  }

  iframeLoaded({ target }) {
    const src = target.getAttribute('src');
    if (!src) return;

    const channel = new MessageChannel();
    this.port1 = channel.port1;
    this.port2 = channel.port2;

    setTimeout(() => {
      this.port1.onmessage = (e) => { this.setHeight(e.data); };
      target.contentWindow.postMessage({ init: true }, '*', [this.port2]);
      if (this.onFrameLoaded) this.onFrameLoaded();
    }, 1500);
  }

  get _daContent() {
    return document.querySelector('da-content');
  }

  render() {
    return html`
      <div class="da-preview-menubar">
        ${Object.keys(SIZES).map((key) => html`
          <span
            class="da-preview-menuitem set-${key}"
            @click=${() => this.setWidth(key)}>
          </span>`)}
        <span class="da-preview-menuitem" @click=${() => this._daContent.hidePreview()}></span>
      </div>
      <iframe
        src=""
        @load=${this.iframeLoaded}
        allow="clipboard-write *"
        scrolling="no"></iframe>
    `;
  }

  updated(props) {
    this.iframe ??= this.shadowRoot.querySelector('iframe');
    if (props.has('body')) this.setBody();
    super.updated(props);
  }
}

customElements.define('da-preview', DaPreview);
