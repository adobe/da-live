import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';

const nx = getNx();
await import(`${nx}/blocks/shared/dialog/dialog.js`);

const { loadStyle } = await import(`${nx}/utils/utils.js`);
const [form, styles] = await Promise.all([
  loadStyle(`${getNx2()}/styles/form.css`),
  loadStyle(import.meta.url),
]);

class DaAltDialog extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    alt: { type: String },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [form, styles];
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

  render() {
    if (!this.open) return nothing;
    return html`
      <nx-dialog title="Edit alt text">
        <form class="alt-form" @submit=${this._onSubmit}>
          <label class="nx-form-field">
            <span>Alt text</span>
            <input class="nx-input" name="alt-text" type="text" autofocus placeholder="Describe the image"
                   autocomplete="off" .value=${this.alt ?? ''} />
          </label>
        </form>
        <button type="button" slot="actions" class="nx-form-btn-secondary"
          @click=${this._onCancel}>Cancel</button>
        <button type="button" slot="actions" class="nx-form-btn-primary"
          @click=${this._onSave}>Save</button>
      </nx-dialog>
    `;
  }
}

customElements.define('da-alt-dialog', DaAltDialog);
export default DaAltDialog;
