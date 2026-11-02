import { LitElement, html } from 'da-lit';
import { getNx, getNx2Api } from '../../scripts/utils.js';
import { iconPathForExt, isImageExt } from '../shared/icons.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const style = await loadStyle(import.meta.url);

export default class DaLandingPreview extends LitElement {
  static properties = {
    path: { type: String },
    ext: { type: String },
    _imageUrl: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  disconnectedCallback() {
    this.resetImage();
    super.disconnectedCallback();
  }

  willUpdate(changed) {
    if (changed.has('path') || changed.has('ext')) this.resetImage();
  }

  updated() {
    if (!this.isConnected || !isImageExt(this.ext)
      || this._imageRequested || this._imageObserver) return;
    this._imageObserver = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      this.stopObserving();
      this.loadImage();
    });
    this._imageObserver.observe(this);
  }

  stopObserving() {
    this._imageObserver?.disconnect();
    this._imageObserver = null;
  }

  resetImage() {
    this.stopObserving();
    this._request = undefined;
    this._imageRequested = false;
    this.dropImage();
  }

  dropImage() {
    if (this._imageUrl) URL.revokeObjectURL(this._imageUrl);
    this._imageUrl = null;
  }

  async loadImage() {
    this.stopObserving();
    const { path } = this;
    const request = {};
    this._request = request;
    this._imageRequested = true;
    try {
      const { source } = await getNx2Api();
      const response = await source.get(path);
      if (!response.ok) return;
      const url = URL.createObjectURL(await response.blob());
      if (this.isConnected && this._request === request) this._imageUrl = url;
      else URL.revokeObjectURL(url);
    } catch {
      // Failed previews keep the shared file-type icon.
    }
  }

  render() {
    return this._imageUrl ? html`<img src=${this._imageUrl} alt="" @error=${this.dropImage}>`
      : html`<svg viewBox="0 0 20 20" aria-hidden="true"><use href="${iconPathForExt(this.ext)}#icon"></use></svg>`;
  }
}

customElements.define('da-landing-preview', DaLandingPreview);
