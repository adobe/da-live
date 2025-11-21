import { getNx } from '../../../../../scripts/utils.js';

// Ensure base sl-* components are registered before subclassing
await import(`${getNx()}/public/sl/components.js`);
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const sharedStyle = await getStyle(new URL('./style.css', import.meta.url).href);

// Reuse the already-registered base class from the sl-components bundle
const SlSelectBase = customElements.get('sl-select');

class SlSelectExtended extends SlSelectBase {
  connectedCallback() {
    // Prevent base class from throwing when reconnecting:
    // Base 'sl-select' calls attachInternals() in connectedCallback, which
    // throws if ElementInternals is already attached. If this element is
    // re-connected, reuse the previously attached internals.
    const existingInternals = this._internals;
    if (existingInternals) {
      this.attachInternals = () => existingInternals;
    }

    super.connectedCallback();

    // Append shared style once
    const currentSheets = this.shadowRoot.adoptedStyleSheets || [];
    if (!currentSheets.includes(sharedStyle)) {
      this.shadowRoot.adoptedStyleSheets = [...currentSheets, sharedStyle];
    }
  }
}

customElements.define('sl-select-extended', SlSelectExtended);

export default SlSelectExtended;

