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
    iconHref: { attribute: false },
    documentPreview: { type: Boolean },
    _imageUrl: { state: true },
    _document: { state: true },
    _previewError: { state: true },
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
    if (['path', 'ext', 'documentPreview'].some((key) => props.has(key) && props.get(key) !== undefined)) {
      this.resetImage();
    }
  }

  updated() {
    // One attempt per path: a failed load must not retry on every re-render.
    if ((!isImageExt(this.ext) && !this.documentPreview)
      || this._imageRequested || this._imageObserver) return;
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
    this._previewRequest = undefined;
    this._document = undefined;
    this._previewError = undefined;
    this.dropImage();
  }

  dropImage() {
    if (this._imageUrl) URL.revokeObjectURL(this._imageUrl);
    this._imageUrl = null;
  }

  async loadImage() {
    this.stopObserving();
    const { path, documentPreview } = this;
    const request = {};
    this._previewRequest = request;
    this._imageRequested = true;
    try {
      const { source } = await getNx2Api();
      const resp = await source.get(path);
      if (documentPreview) {
        if (!resp.ok) throw new Error('Page preview unavailable.');
        const doc = new DOMParser().parseFromString(await resp.text(), 'text/html');
        const main = doc.querySelector('main') || doc.body;
        const title = main.querySelector('h1, h2')?.textContent.trim() || doc.title;
        const text = [...main.querySelectorAll('p')].map((p) => p.textContent.trim()).join(' ').slice(0, 600);
        const src = main.querySelector('img[src]')?.getAttribute('src');
        const imageUrl = src ? new URL(src, `https://content.da.live${path}`) : undefined;
        const imageHref = ['https:', 'http:'].includes(imageUrl?.protocol) ? imageUrl.href : undefined;
        if (!title && !text && !imageHref) throw new Error('Page preview unavailable.');
        if (request === this._previewRequest && this.isConnected) {
          this._document = { title, text, imageHref };
        }
        return;
      }
      if (!resp.ok) return;
      const url = URL.createObjectURL(await resp.blob());
      if (request === this._previewRequest && this.isConnected) this._imageUrl = url;
      else URL.revokeObjectURL(url);
    } catch (error) {
      if (documentPreview && request === this._previewRequest && this.isConnected) {
        this._previewError = error.message;
      }
    }
  }

  render() {
    if (this.busy) return html`<div class="spinner" role="status" aria-label="Renaming"></div>`;
    if (this._imageUrl) {
      return html`<img src="${this._imageUrl}" alt="" @error=${() => this.dropImage()}>`;
    }
    if (this._document) {
      const { title, text, imageHref } = this._document;
      return html`<article class="document-preview" aria-hidden="true">
        <strong>${title}</strong>
        ${imageHref ? html`<img src=${imageHref} alt="" referrerpolicy="no-referrer"
          @error=${() => {
            this._document = { ...this._document, imageHref: undefined };
            this._previewError = 'Image preview unavailable.';
          }}>` : ''}
        <p>${text}</p>
      </article>${this._previewError ? html`<span class="preview-error" role="status">${this._previewError}</span>` : ''}`;
    }
    if (this.iconHref) {
      return html`<span class="type-icon" aria-hidden="true" style="--preview-icon: url('${this.iconHref}')"></span>
        ${this._previewError ? html`<span class="preview-error" role="status">${this._previewError}</span>` : ''}`;
    }
    return html`<svg viewBox="0 0 20 20" aria-hidden="true"><use href="${iconPathForExt(this.ext)}#icon"></use></svg>`;
  }
}

customElements.define('da-card-preview', DaCardPreview);
