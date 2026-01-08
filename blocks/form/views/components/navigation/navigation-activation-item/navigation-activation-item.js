import { LitElement, html } from 'da-lit';
import { getNx } from '../../../../../../scripts/utils.js';
import { EVENT_ACTIVATE_FIELD } from '../../../../constants.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const componentStyle = await getStyle(new URL('./navigation-activation-item.css', import.meta.url).href);

/**
 * Navigation activation item component - displays a clickable activation button.
 * Used for optional array fields that haven't been activated yet.
 *
 * @property {string} label - Display label
 * @property {string} pointer - Item pointer/ID
 * @property {boolean} active - Whether this item is currently active
 * @property {boolean} visible - Whether this item is currently visible
 *
 * @fires Custom event via window for activation
 */
class FormNavigationActivationItem extends LitElement {
  static properties = {
    label: { type: String },
    pointer: { type: String },
    active: { type: Boolean, reflect: true },
    visible: { type: Boolean, reflect: true },
  };

  constructor() {
    super();
    this.active = false;
    this.visible = false;
  }

  connectedCallback() {
    super.connectedCallback();
    const sheets = this.shadowRoot.adoptedStyleSheets || [];
    this.shadowRoot.adoptedStyleSheets = [...sheets, componentStyle];
  }

  handleActivate() {
    const { pointer } = this;

    if (pointer == null) {
      return;
    }

    const event = new CustomEvent(EVENT_ACTIVATE_FIELD, {
      detail: { pointer, source: 'navigation' },
      bubbles: true,
      composed: true,
    });
    window.dispatchEvent(event);
  }

  render() {
    return html`
      <span
        class="activation-item"
        role="button"
        tabindex="0"
        @click=${() => this.handleActivate()}
        @keydown=${(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.handleActivate();
        }
      }}
      >${this.label}</span>
    `;
  }
}

customElements.define('navigation-activation-item', FormNavigationActivationItem);
