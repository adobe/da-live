import { LitElement, html, nothing } from 'da-lit';
import { getNx2 } from '../../../scripts/utils.js';
import defaults from './defaults.js';

const { loadStyle } = await import(`${getNx2()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

class FormCheckbox extends LitElement {
  static properties = {
    checked: { type: Boolean, reflect: true },
    description: { type: String },
    error: { type: String },
    disabled: { type: Boolean, reflect: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [defaults, style];
  }

  handleChange(event) {
    this.checked = event.target.checked;
    // `change` does not cross the shadow boundary; re-dispatch from the host.
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  render() {
    const showHint = !this.error && this.description;
    return html`
      <label class="form-switch${this.error ? ' has-error' : ''}">
        <input
          class="form-switch-input"
          type="checkbox"
          role="switch"
          ?checked=${this.checked}
          ?disabled=${this.disabled}
          @change=${this.handleChange}
        />
        <span class="form-switch-track" aria-hidden="true">
          <span class="form-switch-handle"></span>
        </span>
        <span class="form-switch-label"><slot></slot></span>
      </label>
      ${this.error ? html`<p class="form-field-error">${this.error}</p>` : nothing}
      ${showHint ? html`<p class="form-field-description">${this.description}</p>` : nothing}
    `;
  }
}

if (!customElements.get('form-checkbox')) customElements.define('form-checkbox', FormCheckbox);

export default FormCheckbox;
