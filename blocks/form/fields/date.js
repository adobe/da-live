import { LitElement, html, nothing } from 'da-lit';
import { getNx2 } from '../../../scripts/utils.js';
import defaults from './defaults.js';
import { localToUtc, utcToLocal } from './datetime-zone.js';

const { loadStyle } = await import(`${getNx2()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

const NATIVE_TYPE = { date: 'date', time: 'time', datetime: 'datetime-local' };

// Cap the year to 4 digits; native inputs otherwise allow up to 6.
const RANGE = {
  date: { min: '0001-01-01', max: '9999-12-31' },
  datetime: { min: '0001-01-01T00:00', max: '9999-12-31T23:59' },
};

class FormDate extends LitElement {
  static properties = {
    value: { type: String },
    type: { type: String },
    label: { type: String },
    description: { type: String },
    error: { type: String },
    required: { type: Boolean },
    disabled: { type: Boolean, reflect: true },
  };

  constructor() {
    super();
    this.type = 'date';
    this._lastValue = undefined;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [defaults, style];
  }

  get _input() { return this.shadowRoot.querySelector('input'); }

  focus() { this._input?.focus(); }

  // Skip values we emitted so a re-render can't wipe an in-progress entry.
  updated(changed) {
    if (changed.has('value') && this.value !== this._lastValue) {
      this._lastValue = this.value;
      if (this._input) {
        this._input.value = this.type === 'datetime'
          ? utcToLocal(this.value)
          : (this.value ?? '');
      }
    }
  }

  _onInput(e) {
    const raw = e.target.value;
    const next = this.type === 'datetime' ? localToUtc(raw) : raw;
    this._lastValue = next;
    this.value = next;
  }

  render() {
    const showHint = !this.error && this.description;
    return html`
      <div class="form-field${this.error ? ' has-error' : ''}">
        ${this.label ? html`<label for="form-date">${this.label}${this.required ? html`<span class="form-required">*</span>` : nothing}</label>` : nothing}
        <input
          id="form-date"
          type=${NATIVE_TYPE[this.type] ?? 'date'}
          min=${RANGE[this.type]?.min ?? nothing}
          max=${RANGE[this.type]?.max ?? nothing}
          ?disabled=${this.disabled}
          @input=${this._onInput}
        />
        ${this.error ? html`<p class="form-field-error">${this.error}</p>` : nothing}
        ${showHint ? html`<p class="form-field-description">${this.description}</p>` : nothing}
      </div>
    `;
  }
}

if (!customElements.get('form-date')) customElements.define('form-date', FormDate);

export default FormDate;
