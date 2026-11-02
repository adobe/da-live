import { LitElement, html, nothing } from 'da-lit';
import { getNx2 } from '../../../scripts/utils.js';
import defaults from './defaults.js';
import { icon } from '../icons.js';

const { loadStyle } = await import(`${getNx2()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

// Press-and-hold ramp on the stepper buttons: a longer initial pause, then
// steady fast repeats (mirrors Spectrum's number-field stepper feel).
const HOLD_DELAY_MS = 400;
const HOLD_INTERVAL_MS = 60;
// Shift snaps by a larger increment, like Spectrum's stepModifier.
const SHIFT_FACTOR = 10;

// Spectrum 2 number field: a bordered input with stacked increment/decrement
// steppers at the inline-end. Steps via click (with press-and-hold repeat),
// ArrowUp/ArrowDown, and the wheel while focused; honors min/max/step.
class FormNumberField extends LitElement {
  static properties = {
    value: { type: String },
    label: { type: String },
    description: { type: String },
    error: { type: String },
    placeholder: { type: String },
    name: { type: String },
    required: { type: Boolean },
    disabled: { type: Boolean, reflect: true },
    min: { type: Number },
    max: { type: Number },
    step: { type: Number },
  };

  constructor() {
    super();
    this.step = 1;
    this._holdTimer = 0;
    this._holdInterval = 0;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [defaults, style];
  }

  disconnectedCallback() {
    this._stopHold();
    super.disconnectedCallback();
  }

  get _input() { return this.shadowRoot.querySelector('input'); }

  focus() {
    this._input?.focus();
  }

  handleEvent(event) {
    this.value = event.target.value;
    // Re-dispatch from the host so listeners on <form-number-field> fire across
    // the shadow boundary (matches form-input).
    this.dispatchEvent(new event.constructor(event.type, event));
  }

  _hasMin() {
    return typeof this.min === 'number' && !Number.isNaN(this.min);
  }

  _hasMax() {
    return typeof this.max === 'number' && !Number.isNaN(this.max);
  }

  _clamp(num) {
    let next = num;
    if (this._hasMin()) next = Math.max(this.min, next);
    if (this._hasMax()) next = Math.min(this.max, next);
    return next;
  }

  _atMin() {
    return this._hasMin() && Number(this.value) <= this.min;
  }

  _atMax() {
    return this._hasMax() && Number(this.value) >= this.max;
  }

  _emit(type) {
    this.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
  }

  _stepBy(dir, factor = 1) {
    if (this.disabled) return;
    const stepSize = (this.step || 1) * factor;
    const current = Number(this.value);
    // An empty/invalid value starts stepping from the min (or 0).
    const fallback = this._hasMin() ? this.min : 0;
    const base = Number.isNaN(current) ? fallback : current;
    // toPrecision avoids float dust (e.g. 0.1 + 0.2) accumulating across steps.
    const next = Number(this._clamp(base + dir * stepSize).toPrecision(15));
    this.value = String(next);
    this._emit('input');
  }

  _onKeydown(e) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    this._stepBy(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? SHIFT_FACTOR : 1);
    this._emit('change');
  }

  _onWheel(e) {
    // Only steer the value when the input itself has focus, so the wheel
    // doesn't hijack page scroll on hover.
    if (this.shadowRoot.activeElement !== this._input) return;
    e.preventDefault();
    this._stepBy(e.deltaY < 0 ? 1 : -1, e.shiftKey ? SHIFT_FACTOR : 1);
    this._emit('change');
  }

  _onStepPointerdown(e, dir) {
    if (e.button !== 0 || this.disabled) return;
    e.preventDefault(); // keep focus on the input
    // Capture so a held pointer keeps repeating even if it drifts off the
    // button; tolerate environments where the pointer id isn't active.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no-op */ }
    this._input?.focus();
    const factor = e.shiftKey ? SHIFT_FACTOR : 1;
    this._stepBy(dir, factor);
    this._holdTimer = setTimeout(() => {
      this._holdInterval = setInterval(() => this._stepBy(dir, factor), HOLD_INTERVAL_MS);
    }, HOLD_DELAY_MS);
  }

  _onStepPointerup() {
    this._stopHold();
    this._emit('change');
  }

  _stopHold() {
    clearTimeout(this._holdTimer);
    clearInterval(this._holdInterval);
    this._holdTimer = 0;
    this._holdInterval = 0;
  }

  render() {
    const showHint = !this.error && this.description;
    return html`
      <div class="form-field${this.error ? ' has-error' : ''}">
        ${this.label ? html`<label for="form-number">${this.label}${this.required ? html`<span class="form-required">*</span>` : nothing}</label>` : nothing}
        <div class="form-number-wrap">
          <input
            id="form-number"
            type="number"
            inputmode="numeric"
            .value=${this.value ?? ''}
            placeholder=${this.placeholder ?? nothing}
            min=${this._hasMin() ? this.min : nothing}
            max=${this._hasMax() ? this.max : nothing}
            step=${this.step ?? nothing}
            ?disabled=${this.disabled}
            @input=${this.handleEvent}
            @change=${this.handleEvent}
            @keydown=${this._onKeydown}
            @wheel=${this._onWheel}
          />
          ${this.error ? icon('alert', 'form-field-icon') : nothing}
          <span class="form-number-buttons" aria-hidden="true">
            <button
              type="button"
              class="form-number-step form-number-step-up"
              tabindex="-1"
              ?disabled=${this.disabled || this._atMax()}
              @pointerdown=${(e) => this._onStepPointerdown(e, 1)}
              @pointerup=${this._onStepPointerup}
              @pointercancel=${this._onStepPointerup}
            >${icon('chevronUp', 'form-number-chevron')}</button>
            <button
              type="button"
              class="form-number-step form-number-step-down"
              tabindex="-1"
              ?disabled=${this.disabled || this._atMin()}
              @pointerdown=${(e) => this._onStepPointerdown(e, -1)}
              @pointerup=${this._onStepPointerup}
              @pointercancel=${this._onStepPointerup}
            >${icon('chevronDown', 'form-number-chevron')}</button>
          </span>
        </div>
        ${this.error ? html`<p class="form-field-error">${this.error}</p>` : nothing}
        ${showHint ? html`<p class="form-field-description">${this.description}</p>` : nothing}
      </div>
    `;
  }
}

if (!customElements.get('form-number-field')) customElements.define('form-number-field', FormNumberField);

export default FormNumberField;
