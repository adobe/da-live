import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const nx = getNx();
await import(`${nx}/blocks/shared/dialog/dialog.js`);

const { loadStyle } = await import(`${nx}/utils/utils.js`);
const [base, styles] = await Promise.all([
  loadStyle(new URL('../styles/base.css', import.meta.url).href),
  loadStyle(import.meta.url),
]);

class DaAltDialog extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    alt: { type: String },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [base, styles];
  }

  _onSave() {
    this.shadowRoot.querySelector('.alt-form').requestSubmit();
  }

  _onSubmit(e) {
    e.preventDefault();
    const alt = e.target.elements['alt-text'].value.trim();
    this.dispatchEvent(new CustomEvent('da-alt-submit', {
      detail: { alt },
      bubbles: true,
      composed: true,
    }));
  }

  _onCancel() {
    this.shadowRoot.querySelector('nx-dialog').close();
  }

  _onClose() {
    this.dispatchEvent(new CustomEvent('da-alt-cancel', {
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    if (!this.open) return nothing;
    return html`
      <nx-dialog title="Edit alt text" @close=${this._onClose}>
        <form class="alt-form" @submit=${this._onSubmit}>
          <label class="da-form-field">
            <span>Alt text</span>
            <input class="da-input" name="alt-text" type="text" autofocus placeholder="Describe the image"
                   autocomplete="off" .value=${this.alt ?? ''} />
          </label>
        </form>
        <button type="button" slot="actions" class="da-btn-secondary"
          @click=${this._onCancel}>Cancel</button>
        <button type="button" slot="actions" class="da-btn-primary"
          @click=${this._onSave}>Save</button>
      </nx-dialog>
    `;
  }
}

customElements.define('da-alt-dialog', DaAltDialog);
export default DaAltDialog;
