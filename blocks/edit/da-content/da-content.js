import { LitElement, html } from '../../../deps/lit/lit-core.min.js';

import getSheet from '../../shared/sheet.js';
const sheet = await getSheet('/blocks/edit/da-content/da-content.css');

import '../da-editor/da-editor.js';
import '../da-preview/da-preview.js';

export default class DaContent extends LitElement {
  static properties = {
    path: { state: true },
  };

  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  showPreview(e) {
    this.classList.add('show-preview');
    e.target.parentElement.classList.add('show-preview');
    this.shadowRoot.querySelector('da-preview').classList.add('show-preview');
  }

  render() {
    return html`
      <da-editor path=${this.path}></da-editor>
      <da-preview path=${this.path}></da-preview>
      <div class="da-preview-menubar">
        <span class="da-preview-menuitem show-preview" @click=${this.showPreview}></span>
      </div>
    `;
  }
}

customElements.define('da-content', DaContent);
