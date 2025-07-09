import { LitElement, html, nothing } from 'da-lit';

import getSheet from '../../shared/sheet.js';
import '../da-editor/da-editor.js';
import { initIms, daFetch } from '../../shared/utils.js';

const sheet = await getSheet('/blocks/edit/da-content/da-content.css');

export default class DaContent extends LitElement {
  static properties = {
    details: { attribute: false },
    permissions: { attribute: false },
    proseEl: { attribute: false },
    wsProvider: { attribute: false },
    startPreviewing: { attribute: false },
    stopPreviewing: { attribute: false },
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

  showPreview() {
    this.daPreview.showPreview(() => {
      if (this.startPreviewing) {
        this.startPreviewing();
      }
    });
  }

  hidePreview() {
    this.daPreview.hidePreview();
    if (this.stopPreviewing) {
      this.stopPreviewing();
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

    const { owner, repo } = this.details;
    const { accessToken } = await initIms();
    fetch(`https://stage-content.da.live/${owner}/${repo}/.gimme_cookie`, {
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
      },
    });
    fetch(`https://main--${repo}--${owner}.stage-ue.da.live/gimme_cookie`, {
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
      },
    });
  
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

  get daPreview() {
    return this.shadowRoot.querySelector('da-preview');
  }

  render() {
    const { owner, repo } = this.details;
    const livePreviewUrl = `https://main--${repo}--${owner}.stage-ue.da.live`;

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
              ${this._ueUrl ? html`<button class="da-editor-tab quiet open-ue" title="Open in-context editing" @click=${this.openUe}>Open in-context editing</button>` : nothing}
            </div>
          </div>
        ` : nothing}
      </div>
      ${this._editorLoaded ? html`<da-preview path=${livePreviewUrl}></da-preview>` : nothing}
      ${this._editorLoaded ? html`<da-versions path=${this.details.fullpath} @preview=${this.handlePreview} @close=${this.handleCloseVersions}></da-versions>` : nothing}
    `;
  }
}

customElements.define('da-content', DaContent);
