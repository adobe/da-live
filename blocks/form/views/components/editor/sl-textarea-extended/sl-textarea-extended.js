import { getNx } from '../../../../../../scripts/utils.js';
import createDebouncedHandleEvent from '../../../../utils/debounced-input-handler.js';

// Ensure base sl-* components are registered before subclassing
await import(`${getNx()}/public/sl/components.js`);
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const globalStyle = await getStyle(new URL('../../../../../global.css', import.meta.url).href);
const sharedStyle = await getStyle(new URL('../sl-shared.css', import.meta.url).href);

// Reuse the already-registered base class from the sl-components bundle
const SlTextareaBase = customElements.get('sl-textarea');

/**
 * Extended textarea component with debouncing and custom styling.
 * Extends Shoelace textarea with debounced input events and form-specific styles.
 */
class SlTextareaExtended extends SlTextareaBase {
  constructor() {
    super();
    this._debounceTimer = null;
    this._debounceDelay = 300;
    this._pendingValue = null;
  }

  connectedCallback() {
    super.connectedCallback();
    const sheets = this.shadowRoot.adoptedStyleSheets || [];
    this.shadowRoot.adoptedStyleSheets = [...sheets, globalStyle, sharedStyle];
    // Create debounced handleEvent method
    this.handleEvent = createDebouncedHandleEvent(this, super.handleEvent);
  }

  /** Prevent external value updates while user is typing. */
  updated(changedProperties) {
    super.updated(changedProperties);
    // If textarea is focused and value is being updated externally, restore the pending value
    if (changedProperties.has('value') && this._pendingValue !== null) {
      const textarea = this.shadowRoot.querySelector('textarea');
      // Check if textarea is currently focused using document.activeElement
      const isFocused = textarea && document.activeElement === textarea;
      if (isFocused && textarea.value !== this._pendingValue) {
        textarea.value = this._pendingValue;
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

customElements.define('sl-textarea-extended', SlTextareaExtended);
export default SlTextareaExtended;
