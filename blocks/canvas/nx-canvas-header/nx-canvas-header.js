import { LitElement, html } from 'da-lit';

import { loadStyle } from '../../shared/nxutils.js';

const style = await loadStyle(import.meta.url);

const ICONS = {
  undo: '/img/icons/s2-icon-undo-20-n.svg',
  redo: '/img/icons/s2-icon-redo-20-n.svg',
  splitLeft: '/blocks/canvas/img/s2-icon-splitleft-20-n.svg',
  splitRight: '/blocks/canvas/img/s2-icon-splitright-20-n.svg',
  gridCompare: '/blocks/canvas/img/s2-icon-gridcompare-20-n.svg',
};

const EDITOR_VIEWS = /** @type {const} */ (['layout', 'content', 'split']);

class NXCanvasHeader extends LitElement {
  static properties = {
    /** `'layout'` / `'content'` = single pane; `'split'` = doc + WYSIWYG side by side */
    editorView: { type: String, reflect: true },
    undoAvailable: { type: Boolean },
    redoAvailable: { type: Boolean },
  };

  constructor() {
    super();
    this.editorView = 'layout';
    this.undoAvailable = false;
    this.redoAvailable = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
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
    return html`<img src="${ICONS[name]}" aria-hidden="true">`;
  }

  render() {
    return html`
      <header class="bar" part="bar">
        <div class="group group-start" part="group-start">
          <button type="button" class="icon-btn" part="btn toggle-before" data-action="open-panel-before" aria-label="Open before panel" @click=${() => this._openPanel('before')}>
            ${this._renderIcon('splitLeft')}
          </button>
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
        </div>

        <div class="group group-end" part="group-end">
          <button type="button" class="icon-btn" part="btn toggle-after" data-action="open-panel-after" aria-label="Open after panel" @click=${() => this._openPanel('after')}>
            ${this._renderIcon('splitRight')}
          </button>
        </div>
      </header>
    `;
  }
}

customElements.define('nx-canvas-header', NXCanvasHeader);
