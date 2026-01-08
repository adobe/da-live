import { getNx } from '../../../../../../scripts/utils.js';
import createDebouncedHandleEvent from '../../../../utils/debounced-input-handler.js';

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
 */
class SlNumberExtended extends SlInputBase {
  constructor() {
    super();
    this.type = 'number';
    this._debounceTimer = null;
    this._debounceDelay = 300;
    this._pendingValue = null;
  }

  connectedCallback() {
    super.connectedCallback();
    const sheets = this.shadowRoot.adoptedStyleSheets || [];
    this.shadowRoot.adoptedStyleSheets = [...sheets, globalStyle, sharedStyle];
    
    // Ensure the input type is set to number for native spinners
    this.type = 'number';
    
    // Create debounced handleEvent method
    this.handleEvent = createDebouncedHandleEvent(this, super.handleEvent);
    
    // Force the internal input element to be type="number" after render
    requestAnimationFrame(() => {
      const input = this.shadowRoot.querySelector('input');
      if (input) {
        input.type = 'number';
      }
    });
  }

  /** Prevent external value updates while user is typing. */
  updated(changedProperties) {
    super.updated(changedProperties);
    
    // Ensure input type is number
    const input = this.shadowRoot.querySelector('input');
    if (input && input.type !== 'number') {
      input.type = 'number';
    }
    
    // If input is focused and value is being updated externally, restore the pending value
    if (changedProperties.has('value') && this._pendingValue !== null) {
      if (input && document.activeElement === input && input.value !== this._pendingValue) {
        input.value = this._pendingValue;
      }
    }
  }

  disconnectedCallback() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    super.disconnectedCallback();
  }
}

customElements.define('sl-number-extended', SlNumberExtended);
export default SlNumberExtended;

