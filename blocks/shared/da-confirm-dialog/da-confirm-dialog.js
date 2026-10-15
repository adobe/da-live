import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';

const nx = getNx();
await import(`${nx}/blocks/shared/dialog/dialog.js`);
const { loadStyle } = await import(`${nx}/utils/utils.js`);
const form = await loadStyle(`${getNx2()}/styles/form.css`);
const STYLE = await loadStyle(import.meta.url);

/**
 * Confirm dialog on top of nx-dialog. Default slot is the body.
 * action: { style: 'negative' | 'accent', label, click, disabled }
 */
class DaConfirmDialog extends LitElement {
  static properties = {
    title: { type: String },
    message: { attribute: false },
    action: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [form, STYLE];
  }

  _onCancel() {
    this.shadowRoot.querySelector('nx-dialog').close();
  }

  render() {
    const { action } = this;
    return html`
      <nx-dialog title=${this.title ?? ''}>
        <slot></slot>
        ${this.message ? html`<span slot="actions" class="da-confirm-message">${this.message}</span>` : nothing}
        <button type="button" slot="actions" class="nx-form-btn-secondary" @click=${this._onCancel}>Cancel</button>
        ${action ? html`<button type="button" slot="actions"
          class="nx-form-btn-primary ${action.style ?? ''}"
          ?disabled=${action.disabled}
          @click=${action.click}>${action.label}</button>` : nothing}
      </nx-dialog>
    `;
  }
}

customElements.define('da-confirm-dialog', DaConfirmDialog);
export default DaConfirmDialog;
