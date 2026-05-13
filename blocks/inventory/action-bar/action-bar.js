import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { isFolder } from '../utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { loadHrefSvg, ICONS_BASE } = await import(`${getNx()}/utils/svg.js`);

const styles = await loadStyle(import.meta.url);
const [closeIcon, previewIcon, publishIcon] = await Promise.all([
  loadHrefSvg(`${ICONS_BASE}S2_Icon_Close_20_N.svg`),
  loadHrefSvg(`${ICONS_BASE}S2_Icon_Preview_20_N.svg`),
  loadHrefSvg(`${ICONS_BASE}S2_Icon_Publish_20_N.svg`),
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
      </div>
    `;
  }
}

if (!customElements.get('nx-browse-action-bar')) {
  customElements.define('nx-browse-action-bar', NxBrowseActionBar);
}
