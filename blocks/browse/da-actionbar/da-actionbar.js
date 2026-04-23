import { LitElement, html } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

// Styles
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const STYLE = await getStyle(import.meta.url);

const MAX_BULK_URLS = 1000;

export default class DaActionBar extends LitElement {
  static properties = {
    items: { attribute: false },
    permissions: { attribute: false },
    _isCopying: { state: true },
    _isDeleting: { state: true },
    _isMoving: { state: true },
    _isBulkLoading: { state: true },
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
        this.cancelBulkCrawl();
      }
    }

    super.update(props);
  }

  cancelBulkCrawl() {
    if (this._bulkCrawl) {
      this._bulkCrawl.cancelCrawl();
      this._bulkCrawl = null;
    }
    this._isBulkLoading = false;
  }

  emitStatus(text, description, type = 'info') {
    const event = new CustomEvent('onstatus', {
      detail: { text, description, type },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  handleClear() {
    this._isCopying = false;
    this._isMoving = false;
    this._isDeleting = false;
    this.cancelBulkCrawl();
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

  handleRestore() {
    const opts = { bubbles: true, composed: true };
    const event = new CustomEvent('onrestore', opts);
    this.dispatchEvent(event);
  }

  async handleBulk() {
    if (this._isBulkLoading) return;

    const folders = this.items.filter((item) => !item.ext);
    const files = this.items.filter((item) => item.ext);

    let allFiles = files;
    if (folders.length > 0) {
      this._isBulkLoading = true;
      try {
        const { crawl } = await import(`${getNx()}/public/utils/tree.js`);
        const crawlInstance = crawl({
          path: folders.map((folder) => folder.path),
          files,
          concurrent: 5,
        });
        this._bulkCrawl = crawlInstance;
        allFiles = await crawlInstance.results;
        // If cancelled (selection cleared, etc.), bail
        if (this._bulkCrawl !== crawlInstance) return;
      } catch (e) {
        this.emitStatus('Bulk failed', 'Unable to crawl the selected folders.', 'error');
        return;
      } finally {
        this._isBulkLoading = false;
        this._bulkCrawl = null;
      }
    }

    const { items2AemUrls } = await import('../da-list/helpers/utils.js');
    const urls = items2AemUrls(allFiles);
    if (urls.length === 0) return;

    if (urls.length > MAX_BULK_URLS) {
      this.emitStatus(
        'Too many URLs for bulk',
        `This selection expands to ${urls.length} URLs. Bulk supports up to ${MAX_BULK_URLS}.`,
        'error',
      );
      return;
    }

    const list = urls.join(',');
    window.open(`/apps/bulk?nx=local&urls=${encodeURIComponent(list)}`);
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

  get _inTrash() {
    // When the current directory is inside the trash, we swap the Bulk button
    // for a Restore button. Match `/.trash` as a complete segment so we don't
    // false-positive on sibling names like `.trash-backup`.
    const p = this.currentPath;
    if (!p) return false;
    return p.endsWith('/.trash') || p.includes('/.trash/');
  }

  get _canBulk() {
    if (this._inTrash) return false;
    // Bulk accepts files and folders (folders are crawled). Exclude 'link' items
    // and anything that's copy/move in-flight.
    const hasBulkable = this.items.some((item) => {
      if (!item.ext) return true;
      return item.ext !== 'link';
    });
    return hasBulkable && !this._isCopying;
  }

  get _canRestore() {
    if (!this._inTrash) return false;
    // Restore any selected item that has a real path (folders allowed). Exclude
    // nothing special for now.
    return this.items.length > 0 && !this._isCopying;
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
            <img src="/blocks/browse/da-browse/img/CrossSize200.svg" alt="" />
          </button>
          <span>${this.currentAction}</span>
        </div>
        <div class="da-action-bar-right-rail" role="toolbar">
          <button
            @click=${this.handleRename}
            class="rename-button ${this._canWrite ? '' : 'hide'} ${this.items.length === 1 ? '' : 'hide'} ${this._isCopying ? 'hide' : ''}">
            <img src="/blocks/browse/da-browse/img/Smock_TextEdit_18_N.svg" alt="" aria-hidden="true"/>
            <span>Rename</span>
          </button>
          <button
            @click=${this.handleCopy}
            class="copy-button ${this._isCopying ? 'hide' : ''}">
            <img src="/blocks/browse/da-browse/img/Smock_Copy_18_N.svg" alt="" aria-hidden="true"/>
            <span>Copy</span>
          </button>
          <button
            @click=${this.handleMove}
            class="copy-button ${this._canWrite ? '' : 'hide'} ${this._isCopying ? 'hide' : ''}">
            <img src="/blocks/browse/da-browse/img/Smock_Cut_18_N.svg" alt="" aria-hidden="true"/>
            <span>Cut</span>
          </button>
          <button
            @click=${this.handlePaste}
            class="copy-button ${this._canWrite ? '' : 'hide'} ${this._isCopying ? '' : 'hide'}">
            <img src="/blocks/browse/da-browse/img/Smock_Copy_18_N.svg" alt="" aria-hidden="true"/>
            <span>Paste</span>
          </button>
          <button
            @click=${this.handleDelete}
            class="delete-button ${this._canWrite ? '' : 'hide'} ${this._isCopying ? 'hide' : ''}">
            <img src="/blocks/browse/da-browse/img/Smock_Delete_18_N.svg" alt="" aria-hidden="true"/>
            <span>Delete</span>
          </button>
          <button
            @click=${this.handleShare}
            class="share-button ${this._canShare ? '' : 'hide'}">
            <img src="/blocks/browse/img/Smock_Share_18_N.svg" alt="" aria-hidden="true"/>
            <span>Share</span>
          </button>
          <button
            @click=${this.handleBulk}
            ?disabled=${this._isBulkLoading}
            class="bulk-button ${this._canBulk ? '' : 'hide'} ${this._isBulkLoading ? 'is-loading' : ''}">
            <img src="/blocks/browse/img/Smock_LinkOut_18_N.svg" alt="" aria-hidden="true"/>
            <span>${this._isBulkLoading ? 'Loading…' : 'Bulk'}</span>
          </button>
          <button
            @click=${this.handleRestore}
            class="restore-button ${this._canRestore ? '' : 'hide'}">
            <img src="/blocks/edit/img/Smock_Refresh_18_N.svg" alt="" aria-hidden="true"/>
            <span>Restore</span>
          </button>
        </div>
      </div>`;
  }
}

customElements.define('da-actionbar', DaActionBar);
