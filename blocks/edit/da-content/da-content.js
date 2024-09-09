import { LitElement, html } from 'da-lit';

import getSheet from '../../shared/sheet.js';
import '../da-editor/da-editor.js';
import '../da-preview/da-preview.js';
import '../da-versions/da-versions.js';

const sheet = await getSheet('/blocks/edit/da-content/da-content.css');

export default class DaContent extends LitElement {
  static properties = {
    details: { attribute: false },
    _sourceUrl: { state: true },
    _versionUrl: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this._sourceUrl = this.details.sourceUrl;
  }

  showPreview() {
    this.classList.add('show-preview');
    this.shadowRoot.querySelector('da-preview').classList.add('show-preview');
  }

  showVersions() {
    this.classList.add('show-versions');
    this.daVersions.open = true;
    this.daVersions.classList.add('show-versions');
  }

  handleReset() {
    this._versionUrl = null;
  }

  handlePreview(e) {
    this._versionUrl = e.detail.url;
  }

  handleCloseVersions() {
    this.daVersions.open = false;
    this.classList.remove('show-versions');
    this.daVersions.classList.remove('show-versions');
  }

  get daVersions() {
    return this.shadowRoot.querySelector('da-versions');
  }

  render() {
    return html`
      <div class="editor-wrapper">
        <da-editor path="${this._sourceUrl}" version="${this._versionUrl}" @versionreset=${this.handleReset}></da-editor>
        <div class="da-editor-tabs">
          <div class="da-editor-tabs-full">
            <button class="da-editor-tab show-preview" title="Preview" @click=${this.showPreview}>Preview</button>
          </div>
          <div class="da-editor-tabs-quiet">
            <button class="da-editor-tab quiet show-versions" title="Versions" @click=${this.showVersions}>Versions</button>
          </div>
        </div>
      </div>
      <da-preview path=${this.details.previewUrl}></da-preview>
      <da-versions path=${this.details.fullpath} @preview=${this.handlePreview} @close=${this.handleCloseVersions}></da-versions>
    `;
  }
}

customElements.define('da-content', DaContent);
