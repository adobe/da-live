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
    commentsController: { attribute: false },
    _editorLoaded: { state: true },
    _showPane: { state: true },
    _versionUrl: { state: true },
    _versionLabel: { state: true },
    _externalUrl: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];

    this._keydownHandler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.code === 'KeyM') {
        e.preventDefault();
        const hasSelection = this.commentsController?.hasSelection;
        if (this._showPane === 'comments' && !hasSelection) {
          this.togglePane({ detail: null });
          return;
        }
        this.commentsController?.requestCompose();
        this._showPane = 'comments';
      }
    };

    window.addEventListener('keydown', this._keydownHandler);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this._keydownHandler);
    this.teardownCommentsObservers();
  }

  renderCommentBadge() {
    const count = this.commentsController?.counts?.active ?? 0;
    const label = this.commentsController?.hasSelection ? '+' : count;
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

  setupCommentsObservers() {
    this.teardownCommentsObservers();
    if (!this.commentsController) return;
    this._unsubscribeCommentsController = this.commentsController.subscribe(() => {
      this.requestUpdate();
    });
  }

  teardownCommentsObservers() {
    this._unsubscribeCommentsController?.();
    this._unsubscribeCommentsController = null;
  }

  handleToggleComments() {
    if (this._showPane === 'comments') {
      this.togglePane({ detail: null });
      return;
    }
    this.commentsController?.requestCompose();
    this._showPane = 'comments';
  }

  togglePane({ detail }) {
    this._showPane = detail;
  }

  handleVersionReset() {
    this._versionUrl = null;
    this._versionLabel = null;
  }

  handleVersionPreview({ detail }) {
    this._versionUrl = detail.url;
    this._versionLabel = detail.label || detail.date || '';
  }

  updated(changedProps) {
    if (changedProps.has('commentsController')) this.setupCommentsObservers();
    if (changedProps.has('_showPane') && this.commentsController) {
      if (this._showPane === 'comments') this.commentsController.setPanelOpen(true);
      else this.commentsController.setPanelOpen(false);
    }
  }

  render() {
    const { owner, repo, previewUrl } = this.details;
    const { pathname } = new URL(previewUrl);

    return html`
      <div class="editor-wrapper">
        <da-editor
          path="${this.details.sourceUrl}"
          version="${this._versionUrl}"
          .versionLabel=${this._versionLabel}
          .permissions=${this.permissions}
          .proseEl=${this.proseEl}
          .wsProvider=${this.wsProvider}
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
                title="${this.commentsController?.hasSelection ? 'Add comment' : 'Comments'}"
                @click=${this.handleToggleComments}>
                Comments
                ${this.renderCommentBadge()}
              </button>
            </div>
          </div>
        ` : nothing}
      </div>
      ${this._editorLoaded ? html`
        <da-preview
          path="${getLivePreviewUrl(owner, repo)}${pathname}"
          .show=${this._showPane === 'preview'}
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
          .controller=${this.commentsController}
          @close=${this.togglePane}
          @requestOpen=${() => this.togglePane({ detail: 'comments' })}></da-comments>
        ` : nothing}
    `;
  }
}

customElements.define('da-content', DaContent);
