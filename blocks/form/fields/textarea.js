import { LitElement, html, nothing } from 'da-lit';
import { getNx2 } from '../../../scripts/utils.js';
import defaults from './defaults.js';
import { icon } from '../icons.js';

const { loadStyle } = await import(`${getNx2()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

class FormTextarea extends LitElement {
  static properties = {
    value: { type: String },
    label: { type: String },
    description: { type: String },
    error: { type: String },
    placeholder: { type: String },
    name: { type: String },
    required: { type: Boolean },
    disabled: { type: Boolean, reflect: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [defaults, style];
  }

  focus() {
    this.shadowRoot.querySelector('textarea')?.focus();
  }

  handleEvent(event) {
    this.value = event.target.value;
    // Re-dispatch from the host so listeners on <form-textarea> fire across the shadow boundary.
    this.dispatchEvent(new event.constructor(event.type, event));
  }

  render() {
    const showHint = !this.error && this.description;
    return html`
      <div class="form-field${this.error ? ' has-error' : ''}">
        ${this.label ? html`<label for="form-textarea">${this.label}${this.required ? html`<span class="form-required">*</span>` : nothing}</label>` : nothing}
        <div class="form-input-wrap">
          <textarea
            id="form-textarea"
            .value=${this.value ?? ''}
            placeholder=${this.placeholder ?? nothing}
            ?disabled=${this.disabled}
            @input=${this.handleEvent}
            @change=${this.handleEvent}
          ></textarea>
          ${this.error ? icon('alert', 'form-field-icon') : nothing}
        </div>
        ${this.error ? html`<p class="form-field-error">${this.error}</p>` : nothing}
        ${showHint ? html`<p class="form-field-description">${this.description}</p>` : nothing}
      </div>
    `;
  }
}

if (!customElements.get('form-textarea')) customElements.define('form-textarea', FormTextarea);

export default FormTextarea;
