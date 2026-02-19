import { LitElement, html, nothing } from 'da-lit';

import getSheet from '../../shared/sheet.js';
import '../da-editor/da-editor.js';
import '../da-comment-panel/da-comment-panel.js';
import { getLivePreviewUrl } from '../../shared/constants.js';
import { openCommentPanelInContainer, closeOpenCommentPanel } from '../prose/plugins/commentPlugin.js';

const sheet = await getSheet('/blocks/edit/da-content/da-content.css');

export default class DaContent extends LitElement {
  static properties = {
    details: { attribute: false },
    permissions: { attribute: false },
    proseEl: { attribute: false },
    wsProvider: { attribute: false },
    lockdownImages: { attribute: false },
    _editorLoaded: { state: true },
    _showPane: { state: true },
    _versionUrl: { state: true },
    _externalUrl: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this._onOpenCommentsPane = () => this.togglePane({ detail: 'comments' });
    document.addEventListener('open-comments-pane', this._onOpenCommentsPane);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('open-comments-pane', this._onOpenCommentsPane);
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
    const { default: getExternalUrl } = await import('./helpers/index.js');
    this._externalUrl = await getExternalUrl(
      this.details.owner,
      this.details.repo,
      this.details.previewUrl,
    );
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

  updated(changedProperties) {
    super.updated?.(changedProperties);
    if (!changedProperties.has('_showPane')) return;
    const prev = changedProperties.get('_showPane');
    if (this._showPane === 'comments') {
      this.updateComplete.then(() => {
        const container = this.shadowRoot?.querySelector('.comments-pane-content');
        if (container) {
          openCommentPanelInContainer(container, () => this.togglePane({ detail: null }));
        }
      });
    } else if (prev === 'comments') {
      closeOpenCommentPanel();
    }
  }

  handleVersionReset() {
    this._versionUrl = null;
  }

  handleVersionPreview({ detail }) {
    this._versionUrl = detail.url;
  }

  render() {
    const { owner, repo, previewUrl } = this.details;
    const { pathname } = new URL(previewUrl);

    // Only use livePreviewUrl if lockdownImages flag is set to true
    const displayUrl = this.lockdownImages
      ? `${getLivePreviewUrl(owner, repo)}${pathname}`
      : previewUrl;

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
              <button class="da-editor-tab quiet show-comments" title="Comments" @click=${() => this.togglePane({ detail: 'comments' })}>Comments</button>
              <button class="da-editor-tab quiet show-versions" title="Versions" @click=${() => this.togglePane({ detail: 'versions' })}>Versions</button>
              ${this._externalUrl ? html`<button class="da-editor-tab quiet open-ue" title="Open in-context editing" @click=${this.openUe}>Open in-context editing</button>` : nothing}
            </div>
          </div>
        ` : nothing}
      </div>
      ${this._editorLoaded ? html`
        <da-preview
          path=${displayUrl}
          .show=${this._showPane === 'preview'}
          .lockdownImages=${this.lockdownImages}
          class="${this._showPane === 'preview' ? 'is-visible' : ''}"
          @close=${this.togglePane}></da-preview>
        <da-versions
          path=${this.details.fullpath}
          .open=${this._showPane === 'versions'}
          class="${this._showPane === 'versions' ? 'is-visible' : ''}"
          @preview=${this.handleVersionPreview}
          @close=${this.togglePane}></da-versions>
        <div class="comments-pane ${this._showPane === 'comments' ? 'is-visible' : ''}">
          <div class="comments-pane-content"></div>
        </div>
        ` : nothing}
    `;
  }
}

customElements.define('da-content', DaContent);
