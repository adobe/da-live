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
    _showLivePreview: { state: true },
    _editorLoaded: { state: true },
    _versionUrl: { state: true },
    _ueUrl: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  disconnectWebsocket() {
    if (this.wsProvider) {
      this.wsProvider.disconnect({ data: 'Client navigation' });
      this.wsProvider = undefined;
    }
  }

  showVersions() {
    this.classList.add('show-versions');
    this.daVersions.open = true;
    this.daVersions.classList.add('show-versions');
  }

  async loadViews() {
    // Only import the web components once
    if (this._editorLoaded) return;
    const preview = import('../da-preview/da-preview.js');
    const versions = import('../da-versions/da-versions.js');
    await Promise.all([preview, versions]);
    this._editorLoaded = true;
  }

  async loadUe() {
    const { default: ueUrlHelper } = await import('./helpers/index.js');
    this._ueUrl = await ueUrlHelper(this.details.owner, this.details.previewUrl);
  }

  async handleEditorLoaded() {
    this.loadViews();
    this.loadUe();
  }

  openUe() {
    window.location = this._ueUrl;
  }

  handleLivePreview({ detail }) {
    this.classList.toggle('show-pane');
    this._showLivePreview = detail;
  }

  handleVersionReset() {
    this._versionUrl = null;
  }

  handleVersionPreview({ detail }) {
    this._versionUrl = detail.url;
  }

  handleCloseVersions() {
    this.daVersions.open = false;
    this.classList.toggle('show-pane');
  }

  get daVersions() {
    return this.shadowRoot.querySelector('da-versions');
  }

  get daPreview() {
    return this.shadowRoot.querySelector('da-preview');
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
              <button class="da-editor-tab show-preview" title="Preview" @click=${() => { this.handleLivePreview({ detail: true }); }}>Preview</button>
            </div>
            <div class="da-editor-tabs-quiet">
              <button class="da-editor-tab quiet show-versions" title="Versions" @click=${this.showVersions}>Versions</button>
              ${this._ueUrl ? html`<button class="da-editor-tab quiet open-ue" title="Open in-context editing" @click=${this.openUe}>Open in-context editing</button>` : nothing}
            </div>
          </div>
        ` : nothing}
      </div>
      ${this._editorLoaded ? html`
        <da-preview
          path=${this.details.previewUrl}
          .show=${this._showLivePreview}
          class="${this._showLivePreview ? 'is-visible' : ''}"
          @preview=${this.handleLivePreview}></da-preview>
        <da-versions path=${this.details.fullpath} @preview=${this.handleVersionPreview} @close=${this.handleCloseVersions}></da-versions>
        ` : nothing}
    `;
  }
}

customElements.define('da-content', DaContent);
