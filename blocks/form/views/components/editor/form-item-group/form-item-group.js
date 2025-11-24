import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../../../../scripts/utils.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const globalStyle = await getStyle(new URL('../../../../global.css', import.meta.url).href);
const componentStyle = await getStyle(new URL('./form-item-group.css', import.meta.url).href);

class FormItemGroup extends LitElement {
  static properties = {
    pointer: { type: String },
    label: { type: String },
    items: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    const sheets = this.shadowRoot.adoptedStyleSheets || [];
    this.shadowRoot.adoptedStyleSheets = [...sheets, globalStyle, componentStyle];
    this._onClick = (e) => {
      e.stopPropagation();
      const { pointer } = this;
      if (pointer == null) return;
      window.dispatchEvent(new CustomEvent('activate-item-group', {
        detail: { pointer, source: 'editor' },
        bubbles: true,
        composed: true,
      }));
    };
    this.addEventListener('click', this._onClick);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this._onClick);
    super.disconnectedCallback();
  }

  render() {
    return html`
      <p class="item-title">${this.label || ''}</p>
      <div class="form-children">
        ${Array.isArray(this.items) ? this.items : nothing}
      </div>
    `;
  }
}

customElements.define('form-item-group', FormItemGroup);
export default FormItemGroup;


