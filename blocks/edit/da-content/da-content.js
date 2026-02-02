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
    _showPane: { state: true },
    _versionUrl: { state: true },
    _externalUrl: { state: true },
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
    this._externalUrl = await ueUrlHelper(this.details.owner, this.details.repo, this.details.previewUrl);
  }

  async handleEditorLoaded() {
    this.loadViews();
    this.loadUe();
  }

  openUe() {
    window.location = this._externalUrl;
  }

  togglePane({ detail }) {
    this._showPane = detail;
  }

  handleVersionReset() {
    this._versionUrl = null;
  }

  handleVersionPreview({ detail }) {
    this._versionUrl = detail.url;
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
          @versionreset=${this.handleVersionReset}>
        </da-editor>
        ${this._editorLoaded ? html`
          <div class="da-editor-tabs ${this._showPane ? 'show-pane' : ''}">
            <div class="da-editor-tabs-full">
              <button
                class="da-editor-tab show-preview"
                title="Preview" @click=${() => this.togglePane({ detail: 'preview' })}>Preview</button>
            </div>
            <div class="da-editor-tabs-quiet">
              <button class="da-editor-tab quiet show-versions" title="Versions" @click=${() => this.togglePane({ detail: 'versions' })}>Versions</button>
              ${this._externalUrl ? html`<button class="da-editor-tab quiet open-ue" title="Open in-context editing" @click=${this.openUe}>Open in-context editing</button>` : nothing}
            </div>
          </div>
        ` : nothing}
      </div>
      ${this._editorLoaded ? html`
        <da-preview
          path=${this.details.previewUrl}
          .show=${this._showPane === 'preview'}
          class="${this._showPane === 'preview' ? 'is-visible' : ''}"
          @close=${this.togglePane}></da-preview>
        <da-versions
          path=${this.details.fullpath}
          .open=${this._showPane === 'versions'}
          class="${this._showPane === 'versions' ? 'is-visible' : ''}"
          @preview=${this.handleVersionPreview}
          @close=${this.togglePane}></da-versions>
        ` : nothing}
    `;
  }
}

customElements.define('da-content', DaContent);
