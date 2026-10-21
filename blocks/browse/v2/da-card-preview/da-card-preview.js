import { LitElement, html } from 'da-lit';
import { getNx, getNx2Api } from '../../../../scripts/utils.js';
import { iconPathForExt, isImageExt } from '../../../shared/icons.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const STYLE = await loadStyle(import.meta.url);

// Card thumbnail: file-type icon, lazily fetched image for image files, or a busy spinner.
export default class DaCardPreview extends LitElement {
  static properties = {
    path: { type: String },
    ext: { type: String },
    busy: { type: Boolean },
    _imageUrl: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [STYLE];
  }

  disconnectedCallback() {
    this.resetImage();
    super.disconnectedCallback();
  }

  willUpdate(props) {
    if (props.has('path') && props.get('path') !== undefined) this.resetImage();
  }

  updated() {
    // One attempt per path: a failed load must not retry on every re-render.
    if (!isImageExt(this.ext) || this._imageRequested || this._imageObserver) return;
    // Fetch lazily so large folders only load previews that scroll into view.
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
    this._imageRequested = false;
    this.dropImage();
  }

  dropImage() {
    if (this._imageUrl) URL.revokeObjectURL(this._imageUrl);
    this._imageUrl = null;
  }

  async loadImage() {
    const { path } = this;
    this._imageRequested = true;
    try {
      const { source } = await getNx2Api();
      const resp = await source.get(path);
      if (!resp.ok) return;
      const url = URL.createObjectURL(await resp.blob());
      if (path === this.path && this.isConnected) this._imageUrl = url;
      else URL.revokeObjectURL(url);
    } catch {
      // The icon fallback stays in place.
    }
  }

  render() {
    if (this.busy) return html`<div class="spinner" role="status" aria-label="Renaming"></div>`;
    if (this._imageUrl) {
      return html`<img src="${this._imageUrl}" alt="" @error=${() => this.dropImage()}>`;
    }
    return html`<svg viewBox="0 0 20 20" aria-hidden="true"><use href="${iconPathForExt(this.ext)}#icon"></use></svg>`;
  }
}

customElements.define('da-card-preview', DaCardPreview);
