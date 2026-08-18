import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import { sanitizeName } from '../utils.js';
import getSheet from '../sheet.js';

const nx = getNx();
await import(`${nx}/blocks/shared/dialog/dialog.js`);
const form = await getSheet(`${getNx2()}/styles/form.css`);

class DaNameDialog extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    title: { type: String, attribute: 'dialog-title' },
    placeholder: { type: String },
    saveLabel: { type: String },
    saving: { type: Boolean },
    error: { type: String },
    showCreateAndOpen: { type: Boolean, attribute: 'show-create-and-open' },
    _nameError: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [form];
  }

  _onInput(e) {
    e.target.value = sanitizeName(e.target.value);
    this._nameError = false;
  }

  _onKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this._onSave(true);
    }
  }

  _onSave(openAfter) {
    const input = this.shadowRoot.querySelector('.nx-input');
    const name = sanitizeName(input.value || '', { trimTrailing: true });
    if (!name) {
      this._nameError = true;
      return;
    }
    this._nameError = false;
    this.dispatchEvent(new CustomEvent('da-name-submit', {
      detail: { name, openAfter },
      bubbles: true,
      composed: true,
    }));
  }

  _onCancel() {
    this.shadowRoot.querySelector('nx-dialog').close();
  }

  _onClose() {
    this._nameError = false;
  }

  render() {
    if (!this.open) return nothing;
    return html`
      <nx-dialog title="${this.title ?? 'New item'}" @close=${this._onClose}>
        <label class="nx-form-field ${this._nameError ? 'nx-field-error' : ''}">
          <span>Name</span>
          <input autofocus type="text" class="nx-input" placeholder="${this.placeholder ?? 'name'}"
                 autocomplete="off"
                 @input=${this._onInput} @keydown=${this._onKeydown} />
          <span class="nx-input-error-msg" role="alert">
            ${this._nameError ? 'Please fill out this field.' : (this.error ?? '')}
          </span>
        </label>
        <button type="button" slot="actions" class="da-btn-secondary" @click=${this._onCancel}>Cancel</button>
        <button type="button" slot="actions" class="da-btn-primary" ?disabled=${this.saving}
          @click=${() => this._onSave(false)}>${this.saveLabel ?? 'Create'}</button>
        ${this.showCreateAndOpen ? html`
        <button type="button" slot="actions" class="da-btn-primary" ?disabled=${this.saving}
          @click=${() => this._onSave(true)}>${this.saveLabel ?? 'Create'} and open</button>` : nothing}
      </nx-dialog>
    `;
  }
}

customElements.define('da-name-dialog', DaNameDialog);
export default DaNameDialog;
