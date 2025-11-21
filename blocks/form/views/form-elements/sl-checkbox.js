import { LitElement, html, nothing, spread } from 'da-lit';
import { getNx } from '../../../../scripts/utils.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const sharedStyle = await getStyle(new URL('./form-elements.css', import.meta.url).href);

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
    this.checked = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this._setFormValue();
    this.shadowRoot.adoptedStyleSheets = [...this.shadowRoot.adoptedStyleSheets, sharedStyle];
  }

  update(props) {
    if (props.has('checked') || props.has('value')) {
      this._setFormValue();
    }
    super.update(props);
  }

  _setFormValue() {
    // Omit from submission when unchecked
    const formValue = this.checked ? (this.value ?? 'on') : null;
    this._internals.setFormValue(formValue);
  }

  handleChange(event) {
    this.checked = event.target.checked;
    this._setFormValue();
    const wcEvent = new event.constructor(event.type, event);
    this.dispatchEvent(wcEvent);
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
          part="control"
          type="checkbox"
          name=${this.name || nothing}
          .checked=${this.checked}
          value=${this.value ?? 'on'}
          @change=${this.handleChange}
          class="${this.class} ${this.error ? 'has-error' : ''}"
          ?disabled=${this.disabled}
          ${spread(this._attrs)} />
        ${this.error ? html`<p class="sl-inputfield-error">${this.error}</p>` : nothing}
        ${this.label ? html`<label part="label" for="${this.name}">${this.label}</label>` : nothing}
      </div>
    `;
  }
}

customElements.define('sl-checkbox', SlCheckbox);

export default SlCheckbox;
