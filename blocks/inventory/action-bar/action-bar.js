import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { isFolder } from '../utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { loadHrefSvg, ICONS_BASE } = await import(`${getNx()}/utils/svg.js`);

const ICON_BASE = new URL('../../../img/icons/', import.meta.url).href;
const styles = await loadStyle(import.meta.url);
const [closeIcon, previewIcon, publishIcon, shareIcon, deleteIcon, renameIcon] = await Promise.all([
  loadHrefSvg(`${ICON_BASE}s2-icon-close-20-n.svg`),
  loadHrefSvg(`${ICON_BASE}s2-icon-preview-20-n.svg`),
  loadHrefSvg(`${ICON_BASE}s2-icon-publish-20-n.svg`),
  loadHrefSvg(`${ICON_BASE}s2-icon-share-20-n.svg`),
  loadHrefSvg(`${ICON_BASE}s2-icon-delete-20-n.svg`),
  loadHrefSvg(`${ICONS_BASE}S2_Icon_Edit_20_N.svg`),
]);

class NxBrowseActionBar extends LitElement {
  static properties = {
    selected: { type: Array },
    isDisabled: { type: Boolean, attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  get _count() {
    return this.selected?.length ?? 0;
  }

  _onClear() {
    this.dispatchEvent(new CustomEvent('nx-action-bar-clear', {
      bubbles: true,
      composed: true,
    }));
  }

  _onAction(action) {
    this.dispatchEvent(new CustomEvent('nx-browse-selection-action', {
      detail: { action },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    const count = this._count;
    const singleFile = count === 1 && !isFolder(this.selected[0].item);

    return html`
      <div class="left">
        <button
          type="button"
          class="close-btn"
          aria-label="Clear selection"
          @click=${this._onClear}
        >${closeIcon?.cloneNode(true) ?? nothing}</button>
        <span class="label" aria-live="polite">
          ${count} item${count !== 1 ? 's' : ''} selected
        </span>
      </div>
      <div class="actions">
        ${count === 1 ? html`
          <button
            type="button"
            class="action-btn"
            aria-label="Rename"
            ?disabled=${this.isDisabled}
            @click=${() => this._onAction('rename')}
          >${renameIcon?.cloneNode(true) ?? nothing}<span>Rename</span></button>
        ` : nothing}
        ${singleFile ? html`
          <button
            type="button"
            class="action-btn"
            aria-label="Preview"
            ?disabled=${this.isDisabled}
            @click=${() => this._onAction('preview')}
          >${previewIcon?.cloneNode(true) ?? nothing}<span>Preview</span></button>
          <button
            type="button"
            class="action-btn"
            aria-label="Publish"
            ?disabled=${this.isDisabled}
            @click=${() => this._onAction('publish')}
          >${publishIcon?.cloneNode(true) ?? nothing}<span>Publish</span></button>
        ` : nothing}
        <button
          type="button"
          class="action-btn"
          aria-label="Share"
          ?disabled=${this.isDisabled}
          @click=${() => this._onAction('copyLink')}
        >${shareIcon?.cloneNode(true) ?? nothing}<span>Share</span></button>
        <button
          type="button"
          class="action-btn"
          aria-label="Delete"
          ?disabled=${this.isDisabled}
          @click=${() => this._onAction('delete')}
        >${deleteIcon?.cloneNode(true) ?? nothing}<span>Delete</span></button>
      </div>
    `;
  }
}

if (!customElements.get('nx-browse-action-bar')) {
  customElements.define('nx-browse-action-bar', NxBrowseActionBar);
}
