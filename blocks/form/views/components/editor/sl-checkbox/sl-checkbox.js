import { LitElement, html, nothing, spread } from 'da-lit';
import { getNx } from '../../../../../../scripts/utils.js';
import { ref, createRef } from '../../../../../../deps/lit/dist/index.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const globalStyle = await getStyle(new URL('../../../../../global.css', import.meta.url).href);
const sharedStyle = await getStyle(new URL('../sl-shared.css', import.meta.url).href);

/**
 * Custom checkbox component with form association and error display.
 * Extends LitElement with form participation capabilities.
 */
class SlCheckbox extends LitElement {
  static formAssociated = true;

  static properties = {
    name: { type: String },
    label: { type: String },
    value: { type: String },
    checked: { type: Boolean },
    disabled: { type: Boolean },
    error: { type: String },
    class: { type: String },
  };

  constructor() {
    super();
    this._internals = this.attachInternals();
    this._inputRef = createRef();
    this.checked = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this._setFormValue();
    const sheets = this.shadowRoot.adoptedStyleSheets || [];
    this.shadowRoot.adoptedStyleSheets = [...sheets, globalStyle, sharedStyle];
  }

  update(props) {
    if (props.has('checked') || props.has('value')) {
      this._setFormValue();
    }
    super.update(props);
  }

  _setFormValue() {
    const formValue = this.checked ? (this.value ?? 'on') : null;
    this._internals.setFormValue(formValue);
  }

  handleChange(event) {
    this.checked = event.target.checked;
    this._setFormValue();
    const wcEvent = new CustomEvent('change', {
      bubbles: true,
      composed: true,
      detail: { checked: this.checked },
    });
    this.dispatchEvent(wcEvent);
  }

  focus(options) {
    this._inputRef.value?.focus(options);
  }

  get _attrs() {
    return this.getAttributeNames().reduce((acc, name) => {
      if (name === 'class' || name === 'label' || name === 'error' || name === 'checked') return acc;
      acc[name] = this.getAttribute(name);
      return acc;
    }, {});
  }

  render() {
    return html`
      <div class="sl-inputfield">
        <input
          ${ref(this._inputRef)}
          part="control"
          type="checkbox"
          name=${this.name || nothing}
          .value=${this.value ?? 'on'}
          .checked=${this.checked}
          @change=${this.handleChange}
          class="${this.class} ${this.error ? 'has-error' : ''}"
          ?disabled=${this.disabled}
          ${spread(this._attrs)} />
        ${this.label ? html`<label part="label" for="${this.name}">${this.label}</label>` : nothing}
        ${this.error ? html`<p class="sl-inputfield-error">${this.error}</p>` : nothing}
      </div>
    `;
  }
}

customElements.define('sl-checkbox', SlCheckbox);
export default SlCheckbox;
