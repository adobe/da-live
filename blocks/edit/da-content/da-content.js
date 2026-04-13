import { LitElement, html, nothing } from 'da-lit';

import getSheet from '../../shared/sheet.js';
import '../da-editor/da-editor.js';
import { getLivePreviewUrl } from '../../shared/constants.js';

const sheet = await getSheet('/blocks/edit/da-content/da-content.css');

export default class DaContent extends LitElement {
  static properties = {
    details: { attribute: false },
    permissions: { attribute: false },
    proseEl: { attribute: false },
    wsProvider: { attribute: false },
    commentsStore: { attribute: false },
    lockdownImages: { attribute: false },
    currentUser: { attribute: false },
    _editorLoaded: { state: true },
    _showPane: { state: true },
    _versionUrl: { state: true },
    _externalUrl: { state: true },
    _commentThreadCount: { state: true },
    _canAddComment: { state: true },
    _hasExplicitSelection: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  renderCommentBadge() {
    const label = this._hasExplicitSelection ? '+' : this._commentThreadCount;
    return label ? html`<span class="da-comment-badge">${label}</span>` : nothing;
  }

  disconnectWebsocket() {
    if (this.wsProvider) {
      this.wsProvider.disconnect({ data: 'Client navigation' });
      this.wsProvider = undefined;
    }
  }

  async loadViews() {
    if (this._editorLoaded) return;

    const preview = import('../da-preview/da-preview.js');
    const versions = import('../da-versions/da-versions.js');
    const comments = import('../da-comments/da-comments.js');
    await Promise.all([preview, versions, comments]);
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

  handleToggleComments() {
    if (this._showPane === 'comments') {
      if (this._canAddComment) {
        this.shadowRoot.querySelector('da-comments')?.startAddComment();
      } else {
        this.togglePane({ detail: null });
      }
      return;
    }
    this.togglePane({ detail: 'comments' });
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

  updated(changedProps) {
    if (changedProps.has('commentsStore') || changedProps.has('_showPane')) {
      this.commentsStore?.setCommentsPanelOpen(this._showPane === 'comments');
    }
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
          @versionreset=${this.handleVersionReset}
          @togglecomments=${this.handleToggleComments}>
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
              <button
                class="da-editor-tab quiet show-comments ${this._showPane === 'comments' ? 'is-active' : ''}"
                title="${this._hasExplicitSelection ? 'Add comment' : 'Comments'}"
                @click=${() => this.togglePane({ detail: 'comments' })}>
                Comments
                ${this.renderCommentBadge()}
              </button>
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
        <da-comments
          class="${this._showPane === 'comments' ? 'is-visible' : ''}"
          .open=${this._showPane === 'comments'}
          .currentUser=${this.currentUser}
          .commentsStore=${this.commentsStore}
          @close=${this.togglePane}
          @requestOpen=${() => this.togglePane({ detail: 'comments' })}
          @statusChanged=${(e) => { this._commentThreadCount = e.detail.count; this._canAddComment = e.detail.canAdd; this._hasExplicitSelection = e.detail.hasExplicitSelection; }}></da-comments>
        ` : nothing}
    `;
  }
}

customElements.define('da-content', DaContent);
