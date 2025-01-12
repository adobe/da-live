import { LitElement, html } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

// Styles
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const STYLE = await getStyle(import.meta.url);

export default class DaActionBar extends LitElement {
  static properties = {
    items: { attribute: false },
    permissions: { attribute: false },
    _isCopying: { state: true },
    _isDeleting: { state: true },
    _isMoving: { state: true },
    currentPath: { type: String },
  };

  constructor() {
    super();
    this.items = [];
    this.currentPath = '';
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
    this._isDeleting = true;
    const opts = { bubbles: true, composed: true };
    const event = new CustomEvent('ondelete', opts);
    this.dispatchEvent(event);
  }

  handleShare() {
    const aemUrls = this.items.reduce((acc, item) => {
      if (item.ext) {
        const path = item.path.replace('.html', '');
        const [org, repo, ...pathParts] = path.substring(1).split('/');
        const pageName = pathParts.pop();
        pathParts.push(pageName === 'index' ? '' : pageName);
        acc.push(`https://main--${repo}--${org}.aem.page/${pathParts.join('/')}`);
      }
      return acc;
    }, []);
    const blob = new Blob([aemUrls.join('\n')], { type: 'text/plain' });
    const data = [new ClipboardItem({ [blob.type]: blob })];
    navigator.clipboard.write(data);
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
    if (this._isDeleting) return `Deleting ${this.items.length} ${itemStr}`;
    return `${this.items.length} ${itemStr} selected`;
  }

  render() {
    return html`
      <div class="da-action-bar">
        <div class="da-action-bar-left-rail">
          <button
            class="close-circle"
            @click=${this.handleClear}
            aria-label="Unselect items">
            <img src="/blocks/browse/da-browse/img/CrossSize200.svg" />
          </button>
          <span>${this.currentAction}</span>
        </div>
        <div class="da-action-bar-right-rail">
          <button
            @click=${this.handleRename}
            class="rename-button ${this._canWrite ? '' : 'hide'} ${this.items.length === 1 ? '' : 'hide'} ${this._isCopying ? 'hide' : ''}">
            <img src="/blocks/browse/da-browse/img/Smock_TextEdit_18_N.svg" />
            <span>Rename</span>
          </button>
          <button
            @click=${this.handleCopy}
            class="copy-button ${this._isCopying ? 'hide' : ''}">
            <img src="/blocks/browse/da-browse/img/Smock_Copy_18_N.svg" />
            <span>Copy</span>
          </button>
          <button
            @click=${this.handleMove}
            class="copy-button ${this._canWrite ? '' : 'hide'} ${this._isCopying ? 'hide' : ''}">
            <img src="/blocks/browse/da-browse/img/Smock_Cut_18_N.svg" />
            <span>Cut</span>
          </button>
          <button
            @click=${this.handlePaste}
            class="copy-button ${this._canWrite ? '' : 'hide'} ${this._isCopying ? '' : 'hide'}">
            <img src="/blocks/browse/da-browse/img/Smock_Copy_18_N.svg" />
            <span>Paste</span>
          </button>
          <button
            @click=${this.handleDelete}
            class="delete-button ${this._canWrite ? '' : 'hide'} ${this._isCopying ? 'hide' : ''}">
            <img src="/blocks/browse/da-browse/img/Smock_Delete_18_N.svg" />
            <span>Delete</span>
          </button>
          <button
            @click=${this.handleShare}
            class="share-button ${this._canShare ? '' : 'hide'}">
            <img src="/blocks/browse/img/Smock_Share_18_N.svg" />
            <span>Share</span>
          </button>
        </div>
      </div>`;
  }
}

customElements.define('da-actionbar', DaActionBar);
