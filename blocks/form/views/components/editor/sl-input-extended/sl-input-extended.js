import { getNx } from '../../../../../../scripts/utils.js';

// Ensure base sl-* components are registered before subclassing
await import(`${getNx()}/public/sl/components.js`);
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const globalStyle = await getStyle(new URL('../../../../../global.css', import.meta.url).href);
const componentStyle = await getStyle(new URL('./sl-input-extended.css', import.meta.url).href);

// Reuse the already-registered base class from the sl-components bundle
const SlInputBase = customElements.get('sl-input');

class SlInputExtended extends SlInputBase {
  connectedCallback() {
    super.connectedCallback();
    const sheets = this.shadowRoot.adoptedStyleSheets || [];
    this.shadowRoot.adoptedStyleSheets = [...sheets, globalStyle, componentStyle];
  }
}

customElements.define('sl-input-extended', SlInputExtended);
export default SlInputExtended;
