import { LitElement, html, repeat, nothing } from 'da-lit';
import { DA_ORIGIN } from '../../shared/constants.js';
import { getNx, sanitizePathParts } from '../../../scripts/utils.js';
import { daFetch, aemAdmin } from '../../shared/utils.js';

import '../da-list-item/da-list-item.js';

// Styles & Icons
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const { default: getSvg } = await import(`${getNx()}/utils/svg.js`);
const STYLE = await getStyle(import.meta.url);
const ICONS = [
  '/blocks/edit/img/Smock_Cancel_18_N.svg',
  '/blocks/edit/img/Smock_Checkmark_18_N.svg',
  '/blocks/edit/img/Smock_Refresh_18_N.svg',
];

export default class DaList extends LitElement {
  static properties = {
    listtype: { type: String },
    fullpath: { type: String },
    editor: { type: String },
    select: { type: Boolean },
    sort: { type: Boolean },
    drag: { type: Boolean },
    listItems: { attribute: false },
    newItem: { attribute: false },
    _permissions: { state: true },
    _listItems: { state: true },
    _itemsRemaining: { state: true },
    _itemErrors: { state: true },
    _filter: { state: true },
    _showFilter: { state: true },
    _selectedItems: { state: true },
    _dropFiles: { state: true },
    _dropMessage: { state: true },
    _status: { state: true },
    _confirm: { state: true },
    _confirmText: { state: true },
    _unpublish: { state: true },
  };

  constructor() {
    super();
    this._itemsRemaining = 0;
    this._itemErrors = [];
    this._dropFiles = [];
    this._emptyMessage = 'Empty';
    this._dropMessage = 'Drop content here';
    this._lastCheckedIndex = null;
    this._filter = '';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [STYLE];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  async update(props) {
    if (props.has('listItems') && this.listItems) {
      this._listItems = this.listItems;
    }

    if (props.has('fullpath') && this.fullpath) {
      this._filter = '';
      this._showFilter = undefined;
      this._listItems = await this.getList();
    }

    if (props.has('newItem') && this.newItem) {
      this.handleNewItem();
    }

    super.update(props);
  }

  async firstUpdated() {
    await import('../../shared/da-dialog/da-dialog.js');
    await import('../da-actionbar/da-actionbar.js');
  }

  setStatus(text, description, type = 'info') {
    if (!text) {
      this._status = null;
      return;
    }
    this._status = { type, text, description };
  }

  handlePermissions(permissions) {
    this._permissions = permissions;

    // Notify parent
    const opts = { detail: permissions, bubbles: true, composed: true };
    const event = new CustomEvent('onpermissions', opts);
    this.dispatchEvent(event);
  }

  async getList() {
    try {
      const resp = await daFetch(`${DA_ORIGIN}/list${this.fullpath}`);
      if (resp.permissions) this.handlePermissions(resp.permissions);
      const json = await resp.json();
      return json;
    } catch {
      this._emptyMessage = 'Not permitted';
      return [];
    }
  }

  handleNewItem() {
    // Add it to internal list
    this._listItems.unshift(this.newItem);
    // Clear the public item
    this.newItem = null;
  }

  handleClear() {
    this._listItems = this._listItems.map((item) => ({ ...item, isChecked: false, rename: false }));
    this._selectedItems = [];
    this._lastCheckedIndex = null;

    // Clear all dialog properties
    this.handleConfirmClose();

    // Clear all actionbar properties
    if (this.actionBar) this.actionBar.items = [];
  }

  handleErrorClose() {
    this._itemErrors = [];
  }

  handleConfirmClose() {
    this._confirm = null;
    this._confirmText = null;
    this._unpublish = null;
  }

  handleSelectionState() {
    this._selectedItems = this._listItems.filter((item) => item.isChecked);
    // If more than one item is selected, force everything to not be in a rename state
    if (this._selectedItems.length > 1) {
      this._listItems.forEach((item) => { item.rename = false; });
    }

    this.actionBar.items = this._selectedItems;
    this.requestUpdate();
  }

  handleItemChecked(e, item, index) {
    if (e.detail.shiftKey && this._lastCheckedIndex !== null) {
      const start = Math.min(this._lastCheckedIndex, index);
      const end = Math.max(this._lastCheckedIndex, index);

      for (let i = start; i <= end; i += 1) {
        this._listItems[i].isChecked = e.detail.checked;
      }
      this._lastCheckedIndex = index;
    } else {
      item.isChecked = e.detail.checked;
      this._lastCheckedIndex = e.detail.checked ? index : null;
    }

    if (!e.detail.checked) {
      item.rename = false;
    }

    this.handleSelectionState();
  }

  handleRename() {
    const item = this._listItems.find((lItem) => lItem.isChecked);
    item.rename = true;
    this.requestUpdate();
  }

  handleRenameCompleted(e) {
    const { oldPath, path, name, date } = e.detail;
    const index = this._listItems.findIndex((lItem) => lItem.path === oldPath);
    if (index < 0) return;

    const item = this._listItems[index];

    item.path = path;
    item.name = name;
    item.lastModified = date;

    this._listItems[index] = item;
  }

  wait(milliseconds) {
    return new Promise((r) => {
      setTimeout(r, milliseconds);
    });
  }

  async handleItemAction({ item, type = 'copy' }) {
    let continuation = true;
    let continuationToken;

    const type2api = {
      copy: { api: 'copy', method: 'POST' },
      delete: { api: 'source', method: 'DELETE' },
      move: { api: 'move', method: 'POST' },
    };

    const { api, method } = type2api[type];

    // If source and dest are in the trash it's a proper move within the trash.
    const moveToTrash = api === 'move' && !item.path.includes('/.trash/') && item.destination.includes('/.trash/');

    try {
      while (continuation) {
        let body;

        if (type !== 'delete') {
          body = new FormData();
          body.append('destination', item.destination);
          if (continuationToken) body.append('continuation-token', continuationToken);
        }

        const opts = { method, body };
        const resp = await daFetch(`${DA_ORIGIN}/${api}${item.path}`, opts);
        if (resp.status === 204) {
          continuation = false;
          break;
        }
        const json = await resp.json();
        ({ continuationToken } = json);
        if (!continuationToken) continuation = false;
      }

      item.isChecked = false;

      // Remove or add the item to the current list
      if (moveToTrash || method === 'DELETE') {
        this._listItems = this._listItems.filter((liItem) => liItem.path !== item.path);
      } else {
        this._listItems = [
          { ...item, path: item.destination, isChecked: false },
          ...this._listItems,
        ];
      }
    } catch (e) {
      // The assumption here is that the user does not have permission to write to the trash
      if (moveToTrash) {
        this.handleItemAction({ item, type: 'delete' });
      } else {
        this._itemErrors.push({ ...item, message: `Couldn't ${type} item` });
      }
    }
  }

  async handlePaste(e) {
    // Format the destination items
    const itemsToPaste = this._selectedItems.map((item) => {
      const prefix = item.path.split('/').slice(0, -1).join('/');

      let checkForExisting = true;
      let pasteItem = {
        ...item,
        destination: item.path.replace(prefix, this.fullpath),
      };

      while (checkForExisting) {
        const { destination } = pasteItem;
        const existing = this._listItems.find(({ path }) => path === destination);
        if (existing) {
          const name = `${existing.name}-copy`;
          const dest = item.ext ? `${this.fullpath}/${name}.${item.ext}` : `${existing.path}-copy`;
          pasteItem = { ...item, name, destination: dest };
        } else {
          checkForExisting = false;
        }
      }

      return pasteItem;
    });

    const showStatus = setTimeout(() => {
      this.setStatus('Pasting', 'Please be patient. Pasting items with many children can take time.');
    }, 2000);

    const type = e.detail?.move ? 'move' : 'copy';

    await Promise.all(itemsToPaste.map(async (item) => {
      await this.handleItemAction({ item, type });
    }));

    clearTimeout(showStatus);

    this.setStatus();
    this.handleClear();
  }

  async handleDelete() {
    this._confirm = 'delete';
  }

  async handleConfirmDelete() {
    const { Queue } = await import(`${getNx()}/public/utils/tree.js`);

    const throttle = this._unpublish ? 250 : 0;

    this._itemsRemaining = this._selectedItems.length;

    const callback = async (item) => {
      const [org, site, ...rest] = sanitizePathParts(item.path);

      // If already in trash or not in a site, its a direct delete
      const directDelete = item.path.includes('/.trash/') || rest.length === 0;
      const type = directDelete ? 'delete' : 'move';
      if (!directDelete) {
        rest.pop();

        const date = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
        const datename = `${item.name}--${date}${item.ext ? `.${item.ext}` : ''}`;
        item.destination = `/${org}/${site}/.trash/${rest.length > 0 ? `${rest.join('/')}/` : ''}${datename}`;
      }

      await this.handleItemAction({ item, type });

      if (this._unpublish && this._confirmText === 'YES') {
        const previewJson = await aemAdmin(item.path, 'preview', 'DELETE');
        if (!previewJson) this._itemErrors.push({ ...item, message: 'Couldn\'t unpublish preview' });

        const liveJson = await aemAdmin(item.path, 'live', 'DELETE');
        if (!liveJson) this._itemErrors.push({ ...item, message: 'Couldn\'t unpublish production' });
      }
      this._itemsRemaining -= 1;

      // Done in the loop to prevent CTA flickering
      if (this._itemsRemaining === 0) {
        this.handleClear();
      }
    };

    const queue = new Queue(callback, 5, null, throttle);

    await Promise.all(this._selectedItems.map((item) => queue.push(item)));
  }

  handleShare() {
    this.setStatus('Copied', 'URLs have been copied to the clipboard.');
    setTimeout(() => { this.setStatus(); }, 3000);
  }

  dragenter(e) {
    e.stopPropagation();
    e.target.closest('.da-browse-panel').classList.add('is-dragged-over');
    e.preventDefault();
  }

  dragleave(e) {
    if (!e.target.classList.contains('da-drop-area')) return;
    e.target.closest('.da-browse-panel').classList.remove('is-dragged-over');
    e.preventDefault();
  }

  dragover(e) {
    e.preventDefault();
  }

  setDropMessage() {
    const { length } = this._dropFiles.filter((file) => !file.imported);
    if (length === 0) {
      this._dropMessage = 'Drop content here';
      return;
    }
    const prefix = `Importing - ${length} `;
    const suffix = length === 1 ? 'item' : 'items';
    this._dropMessage = `${prefix} ${suffix}`;
  }

  async drop(e) {
    e.preventDefault();
    const items = e.dataTransfer?.items;
    if (!items) {
      this.shadowRoot.querySelector('.da-browse-panel').classList.remove('is-dragged-over');
      return;
    }

    const entries = [...items].map((item) => item.webkitGetAsEntry()).filter((x) => x);
    if (!entries.length) {
      this.shadowRoot.querySelector('.da-browse-panel').classList.remove('is-dragged-over');
      return;
    }

    const makeBatches = (await import(`${getNx()}/utils/batch.js`)).default;
    const { getFullEntryList, handleUpload } = await import('./helpers/utils.js');
    this._dropFiles = await getFullEntryList(entries);

    this.setDropMessage();

    const batches = makeBatches(this._dropFiles);
    for (const batch of batches) {
      await Promise.all(batch.map(async (file) => {
        const item = await handleUpload(this._listItems, this.fullpath, file);
        this.setDropMessage();
        if (item) {
          this._listItems.unshift(item);
          this.requestUpdate();
        }
      }));
    }
    this._dropFiles = [];
    this.setDropMessage();
    this.shadowRoot.querySelector('.da-browse-panel').classList.remove('is-dragged-over');
  }

  handleCheckAll() {
    const check = !this.isSelectAll;
    this._listItems.forEach((item) => { item.isChecked = check; });
    this.handleSelectionState();
  }

  getSortFn(first, last, prop) {
    return (a, b) => {
      if (prop === 'lastModified') {
        if (!a[prop]) a[prop] = '';
        if (!b[prop]) b[prop] = '';
      }
      if (a[prop] > b[prop]) return first;
      if (a[prop] < b[prop]) return last;
      return 0;
    };
  }

  handleSort(type, prop) {
    const first = type === 'old' ? -1 : 1;
    const last = type === 'old' ? 1 : -1;

    const sortFn = this.getSortFn(first, last, prop);
    this._listItems.sort(sortFn);
    this.requestUpdate();
  }

  handleNameSort() {
    this._sortDate = undefined;
    this._sortName = this._sortName === 'old' ? 'new' : 'old';
    this.handleSort(this._sortName, 'name');
  }

  handleDateSort() {
    this._sortName = undefined;
    this._sortDate = this._sortDate === 'old' ? 'new' : 'old';
    this.handleSort(this._sortDate, 'lastModified');
  }

  toggleFilterView() {
    this._filter = '';
    this._showFilter = !this._showFilter;
    const filterInput = this.shadowRoot?.querySelector('input[name="filter"]');
    filterInput.value = '';
    if (this._showFilter) {
      this.wait(1).then(() => { filterInput.focus(); });
    }
  }

  handleFilterBlur(e) {
    if (e.target.value === '') {
      this._showFilter = false;
    }
  }

  handleNameFilter(e) {
    this._sortName = undefined;
    this._sortDate = undefined;
    this._filter = e.target.value;
  }

  get isSelectAll() {
    const selectCount = this._listItems.filter((item) => item.isChecked).length;
    return selectCount === this._listItems.length && this._listItems.length !== 0;
  }

  get actionBar() {
    return this.shadowRoot?.querySelector('da-actionbar');
  }

  get _itemString() {
    return this._selectedItems.length > 1 ? 'items' : 'item';
  }

  get _confirmContent() {
    const noUnpub = this._selectedItems.some((item) => !item.ext || item.ext === 'link' || item.path.includes('/.trash/'));
    const inTrash = this._selectedItems.some((item) => item.path.includes('/.trash/'));
    const linkOnly = this._selectedItems.length === 1 && this._selectedItems[0].ext === 'link';

    if (noUnpub) {
      return html`<p>Are you sure you want to delete this content?${inTrash || linkOnly ? '' : ' Published items will remain live.'}</p>`;
    }

    const checkbox = html`
      <div class="da-modal-checkbox">
        <input
          type="checkbox"
          name="confirm-unpublish"
          ?checked=${this._unpublish}
          @click=${() => { this._unpublish = !this._unpublish; }}>
        <label
          for="confirm-unpublish"
          @click=${() => { this._unpublish = !this._unpublish; }}>
          Unpublish ${this._itemString}
        </label>
      </div>
    `;

    // If checkbox checked, only return the checkbox
    if (!this._unpublish) return checkbox;

    // Return checkbox and confirm text
    return html`
      ${checkbox}
      <div class="da-actionbar-modal-confirmation">
        <p class="sl-heading-m">Are you sure you want to unpublish?</p>
        <p>Type <strong>YES</strong> to confirm.</p>
        <sl-input
          type="text"
          placeholder="YES"
          autofocus=""
          @input=${({ target }) => { this._confirmText = target.value; }}
          aria-label="Type yes to confirm unpublish"
          value=${this._confirmText}></sl-input>
      </div>
    `;
  }

  renderEmpty() {
    return html`<div class="empty-list"><h3>${this._emptyMessage}</h3></div>`;
  }

  renderStatus() {
    return html`
      <div class="da-list-status">
        <div class="da-list-status-toast da-list-status-type-${this._status.type}">
          <p class="da-list-status-title">${this._status.text}</p>
          ${this._status.description ? html`<p class="da-list-status-description">${this._status.description}</p>` : nothing}
        </div>
      </div>`;
  }

  renderConfirm() {
    const title = `Deleting ${this._selectedItems.length} ${this._itemString}`;
    const hasRemaining = this._itemsRemaining !== 0;
    const message = hasRemaining ? `${this._itemsRemaining} remaining` : nothing;
    const unpublishConfirmed = this._unpublish && this._confirmText !== 'YES';

    const action = {
      style: 'negative',
      label: this._unpublish ? 'Unpublish & delete' : 'Delete',
      click: async () => this.handleConfirmDelete(),
      disabled: unpublishConfirmed || hasRemaining,
    };

    return html`
      <da-dialog
        title=${title}
        .message=${message}
        .action=${action}
        @close=${this.handleConfirmClose}>
        ${this._confirmContent}
      </da-dialog>
    `;
  }

  renderErrors() {
    const action = {
      style: 'accent',
      label: 'Copy errors to clipboard',
      click: async () => {
        const { items2Clipboard } = await import('./helpers/utils.js');
        items2Clipboard(this._itemErrors);
      },
    };

    return html`
      <da-dialog
        title="Errors"
        .action=${action}
        @close=${this.handleErrorClose}>
        ${this._itemErrors.map((item) => html`
          <p class="error-item-message">${item.message}</p>
          <p class="error-item-name">${item.name}</p>
        `)}
      </da-dialog>
    `;
  }

  renderList(items) {
    return html`
      <div class="da-item-list" role="presentation">
      ${repeat(items, (item) => item.path, (item, idx) => html`
        <da-list-item
          role="row"
          @checked=${(e) => this.handleItemChecked(e, item, idx)}
          @onstatus=${({ detail }) => this.setStatus(detail.text, detail.description, detail.type)}
          @renamecompleted=${(e) => this.handleRenameCompleted(e)}
          allowselect="${this.select ? true : nothing}"
          ischecked="${item.isChecked ? true : nothing}"
          rename="${item.rename ? true : nothing}"
          name="${item.name}"
          path="${item.path}"
          date="${item.lastModified}"
          ext="${item.ext}"
          editor="${this.editor}"
          idx=${idx}>
        </da-list-item>`)}
      </div>
    `;
  }

  renderDropArea() {
    return html`
      <div class="da-drop-area" data-message=${this._dropMessage} @dragover=${this.dragover} @drop=${this.drop}></div>`;
  }

  renderCheckBox() {
    return html`
      <div class="checkbox-wrapper" role="columnheader">
        <input type="checkbox" id="select-all" name="select-all" .checked="${this.isSelectAll}" @click="${this.handleCheckAll}" aria-label="Select all items">
        <label class="checkbox-label" for="select-all"></label>
      </div>
      <input type="checkbox" name="select" style="display: none;">
    `;
  }

  getSortAttr(sortType) {
    if (!sortType) return 'none';
    return sortType === 'old' ? 'descending' : 'ascending';
  }

  render() {
    const filteredItems = this._filter
      ? this._listItems.filter((item) => item.name.includes(this._filter))
      : this._listItems;

    return html`
      <div class="da-browse-panel-header" role="row">
        ${this.renderCheckBox()}
        <div class="da-browse-sort" role="presentation">
          <!-- Toggle button is split into 2 buttons (enable/disable) to prevent bug re-toggling on blur event -->
          <div role="columnheader" class="da-browse-sort-filter-container">
            ${!this._showFilter ? html`
              <button class="da-browse-filter" name="toggle-filter" @click=${() => this.toggleFilterView()} aria-label="Toggle filter">
                <img class="toggle-icon-dark" width="20" src="/blocks/browse/da-browse/img/Filter20.svg" alt="" />
              </button>
            ` : html`
              <button class="da-browse-filter selected" name="toggle-filter" @click=${() => this.toggleFilterView()} aria-label="Toggle filter">
                <img class="toggle-icon-dark" width="20" src="/blocks/browse/da-browse/img/Filter20.svg" alt="" />
              </button>
            `}
          </div>
          <div class="da-browse-header-container" role="columnheader" aria-sort="${this.getSortAttr(this._sortName) || 'none'}">
            <input @blur=${this.handleFilterBlur} name="filter" class=${this._showFilter ? 'show' : nothing} @change=${this.handleNameFilter} @keyup=${this.handleNameFilter} type="text" placeholder="Filter" aria-label="Filter items">
            <button class="da-browse-header-name ${this._sortName} ${this._showFilter ? 'hide' : ''}" @click=${this.handleNameSort}>Name</button>
          </div>
          <div class="da-browse-header-container" role="columnheader" aria-sort="${this.getSortAttr(this._sortDate) || 'none'}">
            <button class="da-browse-header-name ${this._sortDate}" @click=${this.handleDateSort}>Modified</button>
          </div>
        </div>
      </div>
      <div class="da-browse-panel" role="rowgroup" aria-label="File list" @dragenter=${this.drag ? this.dragenter : nothing} @dragleave=${this.drag ? this.dragleave : nothing}>
        ${filteredItems?.length > 0 ? this.renderList(filteredItems, true) : this.renderEmpty()}
        ${this.drag ? this.renderDropArea() : nothing}
      </div>
      <da-actionbar
        .permissions=${this._permissions}
        @clearselection=${this.handleClear}
        @rename=${this.handleRename}
        @onpaste=${this.handlePaste}
        @ondelete=${this.handleDelete}
        @onshare=${this.handleShare}
        currentPath="${this.fullpath}"
        role="row"
        data-visible="${this._selectedItems?.length > 0}"></da-actionbar>
      ${this._status ? this.renderStatus() : nothing}
      ${this._confirm ? this.renderConfirm() : nothing}
      ${!this._confirm && this._itemErrors.length ? this.renderErrors() : nothing}
      `;
  }
}

customElements.define('da-list', DaList);
