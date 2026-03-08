import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../../shared/sheet.js';

const sheet = await getSheet(import.meta.url.replace('js', 'css'));

class DaUnpublish extends LitElement {
  static properties = {
    details: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  render() {
    return html`<h1>Unpublish</h1>`;
  }
}

customElements.define('da-unpublish', DaUnpublish);

export default function render(details) {
  const cmp = document.createElement('da-unpublish');
  cmp.details = details;
  return cmp;
}
