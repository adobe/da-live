import { LitElement, html, nothing } from 'da-lit';

import getSheet from '../../shared/sheet.js';
import '../da-editor/da-editor.js';

const sheet = await getSheet('/blocks/edit/da-content/da-content.css');

export default class DaContent extends LitElement {
  static properties = {
    details: { attribute: false },
    permissions: { attribute: false },
    proseEl: { attribute: false },
    wsProvider: { attribute: false },
    _editorLoaded: { state: true },
    _versionUrl: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  update(props) {
    super.update(props);
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

  async handleEditorLoaded() {
    if (this._editorLoaded) return;
    const preview = import('../da-preview/da-preview.js');
    const versions = import('../da-versions/da-versions.js');
    await Promise.all([preview, versions]);
    this._editorLoaded = true;
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
        <da-editor
          path="${this.details.sourceUrl}"
          version="${this._versionUrl}"
          .permissions=${this.permissions}
          .proseEl=${this.proseEl}
          .wsProvider=${this.wsProvider}
          @proseloaded=${this.handleEditorLoaded}
          @versionreset=${this.handleReset}>
        </da-editor>
        ${this._editorLoaded ? html`
          <div class="da-editor-tabs">
            <div class="da-editor-tabs-full">
              <button class="da-editor-tab show-preview" title="Preview" @click=${this.showPreview}>Preview</button>
            </div>
            <div class="da-editor-tabs-quiet">
              <button class="da-editor-tab quiet show-versions" title="Versions" @click=${this.showVersions}>Versions</button>
            </div>
          </div>
        ` : nothing}
      </div>
      ${this._editorLoaded ? html`<da-preview path=${this.details.previewUrl}></da-preview>` : nothing}
      ${this._editorLoaded ? html`<da-versions path=${this.details.fullpath} @preview=${this.handlePreview} @close=${this.handleCloseVersions}></da-versions>` : nothing}
    `;
  }
}

customElements.define('da-content', DaContent);
