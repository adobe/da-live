import { LitElement, html, map } from '../../../deps/lit/lit-all.min.js';
import sheet from './da-content.css' assert { type: 'css' };

import '../da-editor/da-editor.js';
import '../da-preview/da-preview.js';

export default class DaContent extends LitElement {
  static properties = {
    path: { type: String },
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
