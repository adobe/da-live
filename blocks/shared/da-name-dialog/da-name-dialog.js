import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { sanitizeName } from '../utils.js';

const nx = getNx();
await import(`${nx}/blocks/shared/dialog/dialog.js`);

const { loadStyle } = await import(`${nx}/utils/utils.js`);
const [base, styles] = await Promise.all([
  loadStyle(new URL('../styles/base.css', import.meta.url).href),
  loadStyle(import.meta.url),
]);

// A single-field "name this thing" dialog: sanitizes as you type, requires a
// non-empty (post-sanitize) name on submit, and defers to the host for what
// happens with that name — this only ever emits da-name-submit with the final
// sanitized value; the host decides whether/when to close (via `open`) and
// what error, if any, to surface back (via `error`) once its own save resolves.
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
    this.shadowRoot.adoptedStyleSheets = [base, styles];
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
    const input = this.shadowRoot.querySelector('.da-input');
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
        <label class="da-form-field ${this._nameError ? 'da-field-error' : ''}">
          <span>Name</span>
          <input autofocus type="text" class="da-input" placeholder="${this.placeholder ?? 'name'}"
                 autocomplete="off"
                 @input=${this._onInput} @keydown=${this._onKeydown} />
          <span class="da-input-error-msg" role="alert">
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
