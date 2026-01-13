import { getNx } from '../../../../../../scripts/utils.js';

// Ensure base sl-* components are registered before subclassing
await import(`${getNx()}/public/sl/components.js`);
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const globalStyle = await getStyle(new URL('../../../../../global.css', import.meta.url).href);
const sharedStyle = await getStyle(new URL('../sl-shared.css', import.meta.url).href);

// Reuse the already-registered base class from the sl-components bundle
const SlTextareaBase = customElements.get('sl-textarea');

/**
 * Extended textarea component with custom styling.
 * Extends Shoelace textarea with form-specific styles.
 * Note: Debouncing is handled at the consumer level (generic-field).
 */
class SlTextareaExtended extends SlTextareaBase {
  connectedCallback() {
    super.connectedCallback();
    const sheets = this.shadowRoot.adoptedStyleSheets || [];
    this.shadowRoot.adoptedStyleSheets = [...sheets, globalStyle, sharedStyle];
  }
}

customElements.define('sl-textarea-extended', SlTextareaExtended);
export default SlTextareaExtended;
