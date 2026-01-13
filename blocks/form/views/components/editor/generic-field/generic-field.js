import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../../../../scripts/utils.js';

// Import existing sl-* components
import '../sl-checkbox/sl-checkbox.js';
import '../sl-input-extended/sl-input-extended.js';
import '../sl-number-extended/sl-number-extended.js';
import '../sl-select-extended/sl-select-extended.js';
import '../sl-textarea-extended/sl-textarea-extended.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const componentStyle = await getStyle(new URL('./generic-field.css', import.meta.url).href);

/**
 * Generic form field component.
 * Completely domain-agnostic - works with any form system.
 *
 * @property {string} id - Unique identifier
 * @property {string} type - Field type: 'text' | 'number' | 'checkbox' | 'select' | 'textarea'
 * @property {string} label - Field label
 * @property {*} value - Current value
 * @property {Array} options - Options for select field
 * @property {string} error - Error message
 * @property {boolean} required - Is field required
 * @property {boolean} disabled - Is field disabled
 * @property {string} placeholder - Placeholder text
 * @property {Function} onRef - Callback for element registration
 *
 * @fires value-change - { detail: { id, value, source } }
 */
class GenericField extends LitElement {
  static properties = {
    id: { type: String },
    type: { type: String },
    label: { type: String },
    value: { attribute: false },
    options: { attribute: false },
    error: { type: String },
    required: { type: Boolean },
    disabled: { type: Boolean },
    placeholder: { type: String },
    onRef: { attribute: false },
  };

  constructor() {
    super();
    this.type = 'text';
    this.value = '';
    this.options = null;
    this.error = '';
    this.required = false;
    this.disabled = false;
    this.placeholder = '';
    this._inputDebounceTimer = null;
    this._inputDebounceDelay = 300;
  }

  connectedCallback() {
    super.connectedCallback();
    const sheets = this.shadowRoot.adoptedStyleSheets || [];
    this.shadowRoot.adoptedStyleSheets = [...sheets, componentStyle];

    // Add click handler to set active state when field is clicked
    this.addEventListener('click', this._handleClick.bind(this));
  }

  _handleClick() {
    // Emit field's own ID - parent will handle navigation logic
    this.dispatchEvent(new CustomEvent('field-click', {
      detail: { id: this.id },
      bubbles: true,
      composed: true,
    }));
  }

  firstUpdated() {
    // Register element with parent
    if (this.onRef) {
      this.onRef(this.id, this);
    }
  }

  disconnectedCallback() {
    // Clear debounce timer
    if (this._inputDebounceTimer) {
      clearTimeout(this._inputDebounceTimer);
      this._inputDebounceTimer = null;
    }
    // Unregister element
    if (this.onRef) {
      this.onRef(this.id, null);
    }
    super.disconnectedCallback();
  }

  updated(changedProps) {
    super.updated(changedProps);

    // Force Shoelace component to update when value changes
    // This ensures DOM reuse (from repeat directive) doesn't leave stale values
    if (changedProps.has('value')) {
      const input = this.shadowRoot.querySelector('sl-input-extended, sl-number-extended, sl-textarea-extended, sl-select-extended');
      if (input && input.value !== this.value) {
        input.value = this.value ?? '';
      }
    }
  }

  /**
   * Focus the actual input element inside the component.
   * This allows the focus helper to work correctly.
   * @param {Object} options - Focus options
   */
  async focus(options) {
    // Wait for component to finish rendering
    await this.updateComplete;

    const input = this.shadowRoot.querySelector('sl-input-extended, sl-textarea-extended, sl-select-extended, sl-checkbox');
    if (input) {
      // Wait for the child component to be ready too
      if (input.updateComplete) {
        await input.updateComplete;
      }
      // Shoelace components have their own focus() method
      input.focus(options);
    }
  }

  /**
   * Emit value change event.
   * @param {*} value - New value
   * @param {string} source - Change source ('input', 'change', etc.)
   */
  handleValueChange(value, source) {
    this.dispatchEvent(new CustomEvent('value-change', {
      bubbles: true,
      composed: true,
      detail: { id: this.id, value, source },
    }));
  }

  /**
   * Debounced input handler for text-based inputs.
   * Delays emitting value-change events to batch rapid keystrokes.
   * @param {*} value - New value
   * @param {string} source - Change source
   */
  handleDebouncedInput(value, source) {
    if (this._inputDebounceTimer) {
      clearTimeout(this._inputDebounceTimer);
    }

    this._inputDebounceTimer = setTimeout(() => {
      this.handleValueChange(value, source);
      this._inputDebounceTimer = null;
    }, this._inputDebounceDelay);
  }

  get _ariaInvalid() {
    return this.error ? 'true' : 'false';
  }

  renderCheckbox() {
    return html`
      <sl-checkbox
        class="form-input"
        name="${this.id}"
        label="${this.label}"
        .checked=${this.value ?? false}
        data-id="${this.id}"
        .error=${this.error}
        aria-invalid=${this._ariaInvalid}
        aria-required=${this.required ? 'true' : 'false'}
        ?required=${this.required}
        ?disabled=${this.disabled}
        @change=${(e) => {
        const checked = e?.target?.checked ?? e?.detail?.checked ?? false;
        this.handleValueChange(checked, 'checkbox-change');
      }}
      ></sl-checkbox>
    `;
  }

  renderTextarea() {
    return html`
      <sl-textarea-extended
        class="form-input"
        label="${this.label}"
        .value=${this.value ?? ''}
        data-id="${this.id}"
        .error=${this.error}
        placeholder="${this.placeholder}"
        aria-invalid=${this._ariaInvalid}
        aria-required=${this.required ? 'true' : 'false'}
        ?required=${this.required}
        ?disabled=${this.disabled}
        @input=${(e) => this.handleDebouncedInput(e.target.value, 'textarea-input')}
      ></sl-textarea-extended>
    `;
  }

  renderSelect() {
    if (!Array.isArray(this.options) || this.options.length === 0) {
      return nothing;
    }

    const currentValue = Array.isArray(this.value)
      ? (this.value[0] ?? '')
      : (this.value ?? '');
    const hasValue = currentValue !== '' && currentValue != null
      && this.options.includes(currentValue);

    return html`
      <sl-select-extended
        class="form-input"
        name="${this.id}"
        label="${this.label}"
        .value=${hasValue ? currentValue : ''}
        data-id="${this.id}"
        .error=${this.error}
        aria-invalid=${this._ariaInvalid}
        aria-required=${this.required ? 'true' : 'false'}
        ?required=${this.required}
        ?disabled=${this.disabled}
        @change=${(e) => {
        const selectedValue = e?.target?.value ?? e?.detail?.value ?? '';
        if (selectedValue === '') return; // Don't commit placeholder
        this.handleValueChange(selectedValue, 'select-change');
      }}
      >
        ${!hasValue ? html`<option value="" disabled selected>-- Select --</option>` : nothing}
        ${this.options.map((opt) => html`<option value="${opt}">${opt}</option>`)}
      </sl-select-extended>
    `;
  }

  renderInput() {
    return html`
      <sl-input-extended
        class="form-input"
        type="text"
        label="${this.label}"
        .value=${this.value ?? ''}
        data-id="${this.id}"
        .error=${this.error}
        placeholder="${this.placeholder}"
        aria-invalid=${this._ariaInvalid}
        aria-required=${this.required ? 'true' : 'false'}
        ?required=${this.required}
        ?disabled=${this.disabled}
        @input=${(e) => this.handleDebouncedInput(e.target.value, 'input-input')}
      ></sl-input-extended>
    `;
  }

  renderNumber() {
    return html`
      <sl-number-extended
        class="form-input"
        label="${this.label}"
        .value=${this.value ?? ''}
        data-id="${this.id}"
        .error=${this.error}
        placeholder="${this.placeholder}"
        aria-invalid=${this._ariaInvalid}
        aria-required=${this.required ? 'true' : 'false'}
        ?required=${this.required}
        ?disabled=${this.disabled}
        @input=${(e) => {
        const numValue = e.target.value === '' ? null : Number(e.target.value);
        this.handleDebouncedInput(numValue, 'number-input');
      }}
      ></sl-number-extended>
    `;
  }

  render() {
    switch (this.type) {
      case 'checkbox':
        return this.renderCheckbox();
      case 'number':
        return this.renderNumber();
      case 'textarea':
        return this.renderTextarea();
      case 'select':
        return this.renderSelect();
      case 'text':
      default:
        return this.renderInput();
    }
  }
}

customElements.define('generic-field', GenericField);
export default GenericField;
