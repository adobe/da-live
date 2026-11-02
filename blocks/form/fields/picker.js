import { LitElement, html, nothing } from 'da-lit';
import { getNx2 } from '../../../scripts/utils.js';
import defaults from './defaults.js';
import { icon } from '../icons.js';

const { loadStyle } = await import(`${getNx2()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

class FormPicker extends LitElement {
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

  get _select() { return this.shadowRoot.querySelector('select'); }

  updated(props) {
    if (props.has('value') && this._select) this._select.value = this.value ?? '';
  }

  handleChange(event) {
    this.value = event.target.value;
    this.dispatchEvent(new event.constructor(event.type, event));
  }

  // Moving the slotted options into the <select> empties the slot and re-fires
  // slotchange; ignore that echo so we don't wipe the options we just placed.
  handleSlotchange(e) {
    const options = e.target.assignedNodes({ flatten: true })
      .filter((node) => node.nodeName === 'OPTION');
    if (!options.length) return;
    if (this.placeholder) {
      const ph = document.createElement('option');
      ph.value = '';
      ph.textContent = this.placeholder;
      ph.disabled = true;
      ph.hidden = true;
      options.unshift(ph);
    }
    this._select.replaceChildren(...options);
    if (!this.value && options.length) this.value = options[0].value;
    this._select.value = this.value ?? '';
  }

  render() {
    const showHint = !this.error && this.description;
    return html`
      <slot hidden @slotchange=${this.handleSlotchange}></slot>
      <div class="form-field${this.error ? ' has-error' : ''}">
        ${this.label ? html`<label for="form-picker">${this.label}${this.required ? html`<span class="form-required">*</span>` : nothing}</label>` : nothing}
        <div class="form-picker-wrap">
          <select
            id="form-picker"
            ?disabled=${this.disabled}
            @change=${this.handleChange}
          ></select>
          ${this.error ? icon('alert', 'form-field-icon') : nothing}
          ${icon('chevronDown', 'form-picker-chevron')}
        </div>
        ${this.error ? html`<p class="form-field-error">${this.error}</p>` : nothing}
        ${showHint ? html`<p class="form-field-description">${this.description}</p>` : nothing}
      </div>
    `;
  }
}

if (!customElements.get('form-picker')) customElements.define('form-picker', FormPicker);

export default FormPicker;
