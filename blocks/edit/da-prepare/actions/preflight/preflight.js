import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../../../shared/sheet.js';

const sheet = await getSheet(import.meta.url.replace('js', 'css'));

class DaPreflight extends LitElement {
  static properties = {
    details: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    console.log(this.details);
  }

  render() {
    return html`<h1>Preflight</h1>`;
  }
}

customElements.define('da-preflight', DaPreflight);

export default function render(details) {
  const cmp = document.createElement('da-preflight');
  cmp.details = details;
  return cmp;
}
