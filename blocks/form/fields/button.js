import { LitElement, html } from 'da-lit';
import { getNx2 } from '../../../scripts/utils.js';

const { loadStyle } = await import(`${getNx2()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

class FormButton extends LitElement {
  static properties = {
    disabled: { type: Boolean, reflect: true },
    // Spectrum variant: 'accent' (default) or 'secondary'.
    variant: { reflect: true },
  };

  constructor() {
    super();
    this.variant = 'accent';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  render() {
    // Disabled <button> swallows the click; callers bind @click on the host.
    return html`
      <button class="form-button" type="button" ?disabled=${this.disabled}>
        <slot></slot>
      </button>
    `;
  }
}

if (!customElements.get('form-button')) customElements.define('form-button', FormButton);

export default FormButton;
