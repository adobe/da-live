import { LitElement, html, nothing } from 'da-lit';

import { getNx, getNxEWFlags } from '../../../scripts/utils.js';
import { getCommentsBridge, toggleComments, getCommentsVisible } from '../editor-utils/comments-bridge.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

const ICONS = {
  undo: '/img/icons/s2-icon-undo-20-n.svg',
  redo: '/img/icons/s2-icon-redo-20-n.svg',
  splitLeft: '/img/icons/s2-icon-splitleft-20-n.svg',
  splitRight: '/img/icons/s2-icon-splitright-20-n.svg',
  gridCompare: '/img/icons/s2-icon-gridcompare-20-n.svg',
};

const EDITOR_VIEWS = /** @type {const} */ (['layout', 'content', 'split']);

class EWCanvasHeader extends LitElement {
  static properties = {
    /** `'layout'` / `'content'` = single pane; `'split'` = doc + WYSIWYG side by side */
    editorView: { type: String, reflect: true },
    undoAvailable: { type: Boolean },
    redoAvailable: { type: Boolean },
    authorized: { type: Boolean },
    _chatDisabled: { state: true },
    _commentsVisible: { state: true },
  };

  constructor() {
    super();
    this.editorView = 'layout';
    this.undoAvailable = false;
    this.redoAvailable = false;
    this.authorized = true;
    this._commentsVisible = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._unsubHash = hashChange.subscribe((state) => {
      this._syncChatDisabled(state?.org, state?.site);
    });
    this._onControllerChange = () => this._bindComments();
    document.addEventListener('nx-comments-controller-change', this._onControllerChange);
    this._bindComments();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubHash?.();
    document.removeEventListener('nx-comments-controller-change', this._onControllerChange);
    this._unbindComments?.();
  }

  // Track the active comments controller so the toggle reflects effective
  // comment visibility (panel open OR highlights on) as the controller is
  // recreated across documents.
  _bindComments() {
    this._unbindComments?.();
    const sync = () => { this._commentsVisible = getCommentsVisible(); };
    sync();
    const { controller } = getCommentsBridge();
    if (!controller?.on) {
      this._unbindComments = null;
      return;
    }
    const offs = [controller.on('showHighlights', sync), controller.on('panelOpen', sync)];
    this._unbindComments = () => offs.forEach((off) => off?.());
  }

  _toggleComments() {
    toggleComments();
  }

  async _syncChatDisabled(org, site) {
    const key = org && site ? `${org}/${site}` : '';
    this._chatDisableKey = key;
    if (!org || !site) {
      this._chatDisabled = false;
      return;
    }
    const { isEwChatDisabled } = await getNxEWFlags();
    const disabled = await isEwChatDisabled({ org, site });
    if (this._chatDisableKey !== key) return;
    this._chatDisabled = disabled;
  }

  _openPanel(position) {
    this.dispatchEvent(
      new CustomEvent('nx-canvas-open-panel', {
        bubbles: true,
        composed: true,
        detail: { position },
      }),
    );
  }

  _undo() {
    this.dispatchEvent(
      new CustomEvent('nx-canvas-undo', { bubbles: true, composed: true }),
    );
  }

  _redo() {
    this.dispatchEvent(
      new CustomEvent('nx-canvas-redo', { bubbles: true, composed: true }),
    );
  }

  _setEditorView(view) {
    if (!EDITOR_VIEWS.includes(view) || view === this.editorView) return;
    this.editorView = view;
    this.dispatchEvent(
      new CustomEvent('nx-canvas-editor-view', {
        bubbles: true,
        composed: true,
        detail: { view },
      }),
    );
  }

  _renderIcon(name) {
    return html`<svg aria-hidden="true" class="icon" viewBox="0 0 20 20"><use href="${ICONS[name]}#icon"></use></svg>`;
  }

  // Inlined (not <use>) because the s2 icon sprites live on the content mount,
  // while this Chat glyph ships with the code; currentColor themes it.
  _renderChatIcon() {
    return html`<svg aria-hidden="true" class="icon" viewBox="0 0 20 20" fill="currentColor"><path d="M16.75,2h-8c-1.24264,0-2.25,1.00736-2.25,2.25v.5c0,.41406.33594.75.75.75s.75-.33594.75-.75v-.5c0-.41309.33691-.75.75-.75h8c.4125,0,.75.3375.75.75v4.5c0,.4125-.3375.75-.75.75h-.75c-.41421,0-.75.33579-.75.75v1.65137l-1.75-1.54199v-1.10938c0-1.24264-1.00736-2.25-2.25-2.25H3.25c-1.24264,0-2.25,1.00736-2.25,2.25v4.5c0,1.24023,1.00977,2.25,2.25,2.25v2.13672c0,.38281.22754.72363.58008.86914.11914.04883.24414.07227.36523.07227.23828,0,.46582-.08887.61816-.24512l3.21973-2.83301h3.2168c1.24264,0,2.25-1.00736,2.25-2.25v-1.39282l1.63965,1.4436c.18066.18066.41992.27539.66504.27539.12207,0,.24609-.02344.36426-.07227.35254-.14648.58105-.48633.58105-.86719v-2.13672c1.24023,0,2.25-1.00977,2.25-2.25v-4.5c0-1.24264-1.00736-2.25-2.25-2.25ZM12,13.75c0,.4125-.3375.75-.75.75h-3.7832l-2.7168,2.39355v-1.64355c0-.41421-.33579-.75-.75-.75h-.75c-.4125,0-.75-.3375-.75-.75v-4.5c0-.4125.3375-.75.75-.75h8c.4125,0,.75.3375.75.75v4.5Z"></path></svg>`;
  }

  render() {
    return html`
      <header class="bar" part="bar">
        <div class="group group-start" part="group-start">
          ${this._chatDisabled ? nothing : html`
          <button type="button" class="icon-btn" part="btn toggle-before" data-action="open-panel-before" aria-label="Open before panel" @click=${() => this._openPanel('before')}>
            ${this._renderIcon('splitLeft')}
          </button>
          `}
          <button type="button" class="icon-btn" part="btn" data-action="undo" aria-label="Undo" ?disabled=${!this.undoAvailable} @click=${this._undo}>
            ${this._renderIcon('undo')}
          </button>
          <button
            type="button"
            class="icon-btn"
            part="btn"
            data-action="redo"
            aria-label="Redo"
            ?disabled=${!this.redoAvailable}
            @click=${this._redo}
          >
            ${this._renderIcon('redo')}
          </button>
        </div>

        <div class="group group-center" part="group-center">
          ${this.authorized ? html`
          <div class="segmented" role="group" aria-label="Editor view" part="editor-view-toggle">
            <button
              type="button"
              class="segment ${this.editorView === 'layout' ? 'is-selected' : ''}"
              aria-pressed=${this.editorView === 'layout'}
              @click=${() => this._setEditorView('layout')}
            >Layout</button>
            <button
              type="button"
              class="segment ${this.editorView === 'content' ? 'is-selected' : ''}"
              aria-pressed=${this.editorView === 'content'}
              @click=${() => this._setEditorView('content')}
            >Content</button>
            <button
              type="button"
              class="segment segment-icon ${this.editorView === 'split' ? 'is-selected' : ''}"
              aria-pressed=${this.editorView === 'split'}
              aria-label="Split view"
              title="Split view"
              @click=${() => this._setEditorView('split')}
            >${this._renderIcon('gridCompare')}</button>
          </div>
          ` : nothing}
        </div>

        <div class="group group-end" part="group-end">
          <button
            type="button"
            class="icon-btn comments-toggle ${this._commentsVisible ? 'is-active' : ''}"
            part="btn comments-toggle"
            data-action="toggle-comments"
            aria-label=${this._commentsVisible ? 'Hide comments' : 'Show comments'}
            aria-pressed=${this._commentsVisible}
            @click=${this._toggleComments}
          >
            ${this._renderChatIcon()}
          </button>
          <button type="button" class="icon-btn" part="btn toggle-after" data-action="open-panel-after" aria-label="Open after panel" @click=${() => this._openPanel('after')}>
            ${this._renderIcon('splitRight')}
          </button>
        </div>
      </header>
    `;
  }
}

customElements.define('ew-canvas-header', EWCanvasHeader);
