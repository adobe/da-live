import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../../../../scripts/utils.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const globalStyle = await getStyle(new URL('../../../../global.css', import.meta.url).href);
const componentStyle = await getStyle(new URL('./form-item-group.css', import.meta.url).href);

/**
 * Form item group component - collapsible section for form fields.
 * 
 * @property {string} id - Unique identifier
 * @property {string} label - Section label
 * @property {number} badge - Optional badge count
 * @property {boolean} expanded - Is section expanded
 * @property {boolean} active - Is section active
 * 
 * @fires section-click - { detail: { id } }
 */
class FormItemGroup extends LitElement {
  static properties = {
    id: { type: String },
    label: { type: String },
    badge: { type: Number },
    expanded: { type: Boolean },
    active: { type: Boolean, reflect: true },
  };

  constructor() {
    super();
    this.expanded = true;
    this.active = false;
    this.badge = 0;
  }

  connectedCallback() {
    super.connectedCallback();
    const sheets = this.shadowRoot.adoptedStyleSheets || [];
    this.shadowRoot.adoptedStyleSheets = [...sheets, globalStyle, componentStyle];
  }

  handleClick(e) {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('section-click', {
      detail: { id: this.id },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    return html`
      <p class="item-title" part="title" @click=${this.handleClick}>${this.label || ''}</p>
      <div class="form-children">
        <slot></slot>
      </div>
    `;
  }
}

customElements.define('form-item-group', FormItemGroup);
export default FormItemGroup;

