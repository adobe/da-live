import { LitElement, html, nothing } from 'da-lit';

import getSheet from '../../shared/sheet.js';
import { getHtmlWithCursor } from '../../shared/prose2aem.js';

const sheet = await getSheet('/blocks/edit/da-preview/da-preview.css');

// https://gs.statcounter.com/screen-resolution-stats
const SIZES = {
  mobile: { width: '375px', height: '729px' },
  tablet: { width: '1024px', height: '768px' },
  laptop: { width: '1280px', height: '720px' },
  desktop: { width: '1920px', height: '1080px' },
};

export default class DaPreview extends LitElement {
  static properties = {
    path: { type: String },
    show: { attribute: false },
    lockdownImages: { attribute: false },
    _size: { state: true },
    _updating: { state: true },
    _message: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this._updating = true;
    this._size = SIZES.mobile;
    this.setBody();
  }

  handleView({ key }) {
    // If no key, close the preview
    if (!key) {
      const opts = { bubbles: true, composed: true };
      const event = new CustomEvent('close', opts);
      this.dispatchEvent(event);
      return;
    }

    // Otherwise, set the size
    this._size = SIZES[key];
  }

  setBody() {
    if (!window.view) return;

    // Always cache the body for future use
    this.body = getHtmlWithCursor(window.view, this.lockdownImages);

    // If initialized, send the preview to the iframe
    if (this.initialized && this.body) this.sendPreview();
  }

  sendPreview() {
    this._updating = true;
    this.port1.postMessage({ set: 'body', body: this.body });
  }

  handleFirstLoad({ target }) {
    const channel = new MessageChannel();
    this.port1 = channel.port1;
    this.port2 = channel.port2;

    // attempt to send a message
    target.contentWindow.postMessage({ ready: true }, '*', [this.port2]);

    // Use port 1 to receive messages
    this.port1.onmessage = (e) => {
      if (e.data.ready) {
        // If other side is ready, set initalized
        this.initialized = true;

        // Send the first preview
        this.sendPreview();
      }
      // If the other side has been updated remove the updating screen
      if (e.data.updated) {
        setTimeout(() => { this._updating = false; }, 100);
      }
    };
  }

  iframeLoaded({ target }) {
    // Do nothing if there is no source
    if (!target.src) return;

    // Reset iframe initialization
    this.initialized = false;

    // Poll for dapreview.js to respond back
    let count = 0;
    const interval = setInterval(() => {
      count += 1;
      if (this.initialized) {
        // Reset any previous messages
        this._message = null;
        clearInterval(interval);
        return;
      }
      // Give up after 6 attempts
      if (count > 6) {
        this._message = {
          url: 'https://docs.da.live/authors/reference/live-preview',
          text: 'Could not load live preview',
        };
        clearInterval(interval);
        return;
      }
      this.handleFirstLoad({ target });
    }, 500);
  }

  get iframe() {
    return this.shadowRoot.querySelector('iframe');
  }

  get _source() {
    if (!this.show) return nothing;

    // Setup the inital path
    let { path } = this;

    const { origin } = new URL(path);
    const ref = new URL(window.location.href).searchParams.get('ref') || 'on';
    if (ref === 'local') path = path.replace(origin, 'http://localhost:3001');
    const src = path.endsWith('index') ? path.substring(0, path.lastIndexOf('/') + 1) : path;
    return `${src}?dapreview=${ref}&martech=off`;
  }

  render() {
    return html`
      <div class="da-preview-menubar">
        ${Object.keys(SIZES).map((key) => html`
          <span
            class="da-preview-menuitem set-${key}"
            @click=${() => this.handleView({ key })}>
          </span>`)}
        <span class="da-preview-menuitem" @click=${this.handleView}></span>
      </div>
      <div class="iframe-container">
        <div
          class="iframe-wrapper ${this._updating ? 'is-updating' : ''}"
          style="width: ${this._size.width}; height: ${this._size.height};">
          <div class="iframe-overlay">
            ${this._message ? html`
              <a href=${this._message.url}>${this._message.text}</a>` : nothing}</div>
          <iframe
            src="${this._source}"
            @load=${this.iframeLoaded}
            style="width: ${this._size.width}; height: ${this._size.height};"
            allow="clipboard-write *"></iframe>
        </div>
      </div>
    `;
  }
}

customElements.define('da-preview', DaPreview);
