import { getNx } from '../../../../../../scripts/utils.js';

// Ensure base sl-* components are registered before subclassing
await import(`${getNx()}/public/sl/components.js`);
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const globalStyle = await getStyle(new URL('../../../../../global.css', import.meta.url).href);
const sharedStyle = await getStyle(new URL('../sl-shared.css', import.meta.url).href);

// Reuse the already-registered base class from the sl-components bundle
const SlInputBase = customElements.get('sl-input');

/**
 * Extended number input component with custom styling.
 * Extends Shoelace input with form-specific styles and native number input with spinners.
 * Note: Debouncing is handled at the consumer level (generic-field).
 */
class SlNumberExtended extends SlInputBase {
  constructor() {
    super();
    this.type = 'number';
  }

  connectedCallback() {
    super.connectedCallback();
    const sheets = this.shadowRoot.adoptedStyleSheets || [];
    this.shadowRoot.adoptedStyleSheets = [...sheets, globalStyle, sharedStyle];

    // Ensure the input type is set to number for native spinners
    this.type = 'number';

    // Force the internal input element to be type="number" after render
    requestAnimationFrame(() => {
      const input = this.shadowRoot.querySelector('input');
      if (input) {
        input.type = 'number';
      }
    });
  }

  updated(changedProperties) {
    super.updated(changedProperties);

    // Ensure input type is number
    const input = this.shadowRoot.querySelector('input');
    if (input && input.type !== 'number') {
      input.type = 'number';
    }
  }
}

customElements.define('sl-number-extended', SlNumberExtended);
export default SlNumberExtended;
