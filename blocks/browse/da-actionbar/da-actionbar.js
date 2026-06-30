import { LitElement, html } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

// Styles
const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const STYLE = await loadStyle(import.meta.url);

const ICON_NAMES = {
  close: 's2-icon-close-20-n',
  rename: 's2-icon-rename-20-n',
  favorite: 's2-icon-star-20-n',
  copy: 's2-icon-copy-20-n',
  cut: 's2-icon-cut-20-n',
  paste: 's2-icon-paste-20-n',
  delete: 's2-icon-delete-20-n',
  share: 's2-icon-share-20-n',
};

const icon = (name) => html`<svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/${ICON_NAMES[name]}.svg#icon"></use></svg>`;

export default class DaActionBar extends LitElement {
  static properties = {
    items: { attribute: false },
    permissions: { attribute: false },
    isFavorite: { attribute: false },
    _isCopying: { state: true },
    _isDeleting: { state: true },
    _isMoving: { state: true },
    currentPath: { type: String },
  };

  constructor() {
    super();
    this.items = [];
    this.currentPath = '';
    this.isFavorite = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [STYLE];
  }

  async update(props) {
    if (props.has('items')) {
      // Reset state when items go empty
      if (this.items.length === 0) {
        this._isCopying = false;
        this._isMoving = false;
        this._isDeleting = false;
      }
    }

    super.update(props);
  }

  handleClear() {
    this._isCopying = false;
    this._isMoving = false;
    this._isDeleting = false;
    const opts = { detail: true, bubbles: true, composed: true };
    const event = new CustomEvent('clearselection', opts);
    this.dispatchEvent(event);
  }

  handleRename() {
    const opts = { detail: true, bubbles: true, composed: true };
    const event = new CustomEvent('rename', opts);
    this.dispatchEvent(event);
  }

  handleFavorite() {
    const opts = { bubbles: true, composed: true };
    const event = new CustomEvent('onfavorite', opts);
    this.dispatchEvent(event);
  }

  handleCopy() {
    this._isCopying = true;
  }

  handleMove() {
    this._isCopying = true;
    this._isMoving = true;
  }

  handlePaste() {
    if (this._isMoving && !this.inNewDir()) {
      this.handleClear();
      return;
    }
    const detail = { move: this._isMoving };
    const opts = { bubbles: true, composed: true };
    const event = new CustomEvent('onpaste', { ...opts, detail });
    this.dispatchEvent(event);
  }

  handleDelete() {
    const opts = { bubbles: true, composed: true };
    const event = new CustomEvent('ondelete', opts);
    this.dispatchEvent(event);
  }

  async handleShare() {
    const { items2Clipboard } = await import('../da-list/helpers/utils.js');
    items2Clipboard(this.items);
    const opts = { bubbles: true, composed: true };
    const event = new CustomEvent('onshare', opts);
    this.dispatchEvent(event);
  }

  inNewDir() {
    // items can only be selected from the same directory
    const itemPath = this.items?.[0]?.path;
    const itemDir = itemPath?.split('/').slice(0, -1).join('/');
    return itemDir !== this.currentPath;
  }

  get _canWrite() {
    if (!this.permissions) return false;
    return this.permissions.some((permission) => permission === 'write');
  }

  get _canShare() {
    const isFile = this.items.some((item) => item.ext && item.ext !== 'link');
    return isFile && !this._isCopying;
  }

  get currentAction() {
    const itemStr = this.items.length > 1 ? 'items' : 'item';
    if (this._isCopying && this._canWrite) {
      const folderName = this.currentPath.split('/').pop();
      return `Paste ${this.items.length} ${itemStr} into ${folderName}`;
    }
    return `${this.items.length} ${itemStr} selected`;
  }

  render() {
    return html`
      <div class="da-action-bar" role="gridcell" aria-label="Action Bar">
        <div class="da-action-bar-left-rail" role="presentation">
          <button
            class="close-circle"
            @click=${this.handleClear}
            aria-label="Unselect items">
            ${icon('close')}
          </button>
          <span>${this.currentAction}</span>
        </div>
        <div class="da-action-bar-right-rail" role="toolbar">
          <button
            @click=${this.handleRename}
            class="rename-button ${this._canWrite ? '' : 'hide'} ${this.items.length === 1 ? '' : 'hide'} ${this._isCopying ? 'hide' : ''}">
            ${icon('rename')}
            <span>Rename</span>
          </button>
          <button
            @click=${this.handleFavorite}
            aria-pressed=${this.isFavorite ? 'true' : 'false'}
            class="favorite-button ${this.isFavorite ? 'is-favorited' : ''} ${this.items.length === 1 ? '' : 'hide'} ${this._isCopying ? 'hide' : ''}">
            ${icon('favorite')}
            <span>Favorite</span>
          </button>
          <button
            @click=${this.handleCopy}
            class="copy-button ${this._isCopying ? 'hide' : ''}">
            ${icon('copy')}
            <span>Copy</span>
          </button>
          <button
            @click=${this.handleMove}
            class="copy-button ${this._canWrite ? '' : 'hide'} ${this._isCopying ? 'hide' : ''}">
            ${icon('cut')}
            <span>Cut</span>
          </button>
          <button
            @click=${this.handlePaste}
            class="copy-button ${this._canWrite ? '' : 'hide'} ${this._isCopying ? '' : 'hide'}">
            ${icon('paste')}
            <span>Paste</span>
          </button>
          <button
            @click=${this.handleDelete}
            class="delete-button ${this._canWrite ? '' : 'hide'} ${this._isCopying ? 'hide' : ''}">
            ${icon('delete')}
            <span>Delete</span>
          </button>
          <button
            @click=${this.handleShare}
            class="share-button ${this._canShare ? '' : 'hide'}">
            ${icon('share')}
            <span>Share</span>
          </button>
        </div>
      </div>`;
  }
}

customElements.define('da-actionbar', DaActionBar);
