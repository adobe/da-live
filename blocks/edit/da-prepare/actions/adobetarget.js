import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../../shared/sheet.js';

const sheet = await getSheet(import.meta.url.replace('js', 'css'));

class DaTarget extends LitElement {
  static properties = {
    details: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  render() {
    return html`<h1>Adobe Target</h1>`;
  }
}

customElements.define('da-adobetarget', DaTarget);

export default function render(details) {
  const cmp = document.createElement('da-adobetarget');
  cmp.details = details;
  return cmp;
}
