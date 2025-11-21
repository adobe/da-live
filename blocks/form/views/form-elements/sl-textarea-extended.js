import { getNx } from '../../../../scripts/utils.js';

// Ensure base sl-* components are registered before subclassing
await import(`${getNx()}/public/sl/components.js`);
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const sharedStyle = await getStyle(new URL('./form-elements.css', import.meta.url).href);

// Reuse the already-registered base class from the sl-components bundle
const SlTextareaBase = customElements.get('sl-textarea');

class SlTextareaExtended extends SlTextareaBase {
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [...this.shadowRoot.adoptedStyleSheets, sharedStyle];
  }
}

customElements.define('sl-textarea-extended', SlTextareaExtended);

export default SlTextareaExtended;
