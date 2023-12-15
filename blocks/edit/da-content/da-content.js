import { LitElement, html } from '../../../deps/lit/lit-core.min.js';

import getSheet from '../../shared/sheet.js';
const sheet = await getSheet('/blocks/edit/da-content/da-content.css');

import '../da-editor/da-editor.js';
import '../da-preview/da-preview.js';

export default class DaContent extends LitElement {
  static properties = {
    details: {
      attribute: false,
    },
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
      <div class="editor-wrapper">
        <da-editor path="${this.details.sourceUrl}"></da-editor>
        <div class="da-preview-menubar">
          <span class="da-preview-menuitem show-preview" @click=${this.showPreview}></span>
        </div>
      </div>
      <da-preview path=${this.details.previewUrl}></da-preview>
    `;
  }
}

customElements.define('da-content', DaContent);
