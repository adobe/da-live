import { LitElement, html, repeat, nothing } from 'da-lit';
import { DA_ORIGIN } from '../../shared/constants.js';
import { getNx } from '../../../scripts/utils.js';
import { daFetch } from '../../shared/utils.js';

import '../da-actionbar/da-actionbar.js';
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
    select: { type: Boolean },
    sort: { type: Boolean },
    drag: { type: Boolean },
    listItems: { attribute: false },
    newItem: { attribute: false },
    _listItems: { state: true },
    _selectedItems: { state: true },
    _dropFiles: { state: true },
    _dropMessage: { state: true },
    _status: { state: true },
    _viewDeleted: { state: true },
  };

  constructor() {
    super();
    this._dropFiles = [];
    this._dropMessage = 'Drop content here';
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

    if ((props.has('fullpath') || props.has('_viewDeleted')) && this.fullpath) {
      this._listItems = await this.getList();
    }

    if (props.has('newItem') && this.newItem) {
      this.handleNewItem();
    }

    super.update(props);
  }

  setStatus(text, description, type = 'info') {
    if (!text) {
      this._status = null;
      return;
    }
    this._status = { type, text, description };
  }

  getDeletedStoragePath() {
    const repoIdx = this.fullpath.indexOf('/', 1);
    const repo = this.fullpath.substring(0, repoIdx);
    const filePath = this.fullpath.substring(repoIdx);
    return `${repo}/.da-deleted${filePath}/`;
  }

  async getDeletedItems() {
    const deletedPath = this.getDeletedStoragePath();
    const resp = await daFetch(`${DA_ORIGIN}/list${deletedPath}`);
    if (!resp.ok) return [];

    const json = await resp.json();

    const deletedItems = [];
    for (const item of json) {
      const detailResp = await daFetch(`${DA_ORIGIN}/list${item.path}`);
      if (detailResp.ok) {
        const detailJson = await detailResp.json();
        for (const detail of detailJson) {
          deletedItems.push({
            name: item.name.split('.')[0],
            ext: detail.ext,
            path: detail.path,
            lastModified: detail.lastModified,
            deleted: true,
          });
        }
      }
    }
    // TODO Maybe not needed? There is already a sort function
    // deletedItems.sort((a, b) => a.lastModified - b.lastModified);
    // console.log('Found deleted items: ', deletedItems);
    return deletedItems;
  }

  async getList() {
    const resp = await daFetch(`${DA_ORIGIN}/list${this.fullpath}`);
    if (!resp.ok) return null;
    const listJson = await resp.json();

    if (!this._viewDeleted) {
      return listJson;
    }

    const deletedItems = await this.getDeletedItems();
    return listJson.concat(deletedItems);
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
    if (this.actionBar) this.actionBar.items = [];
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

  handleItemChecked(e, item) {
    if (e.detail.checked) {
      item.isChecked = true;
    } else {
      item.isChecked = false;
      item.rename = false;
    }
    this.handleSelectionState();
  }

  handleRename() {
    const item = this._listItems.find((lItem) => lItem.isChecked);
    item.rename = true;
    this.requestUpdate();
  }

  async handlePasteItem(item) {
    let continuation = true;
    let continuationToken;

    while (continuation) {
      const formData = new FormData();
      formData.append('destination', item.destination);
      if (continuationToken) formData.append('continuation-token', continuationToken);
      const opts = { method: 'POST', body: formData };
      const resp = await daFetch(`${DA_ORIGIN}/copy${item.path}`, opts);
      const json = await resp.json();
      ({ continuationToken } = json);
      if (!continuationToken) continuation = false;
    }

    item.isChecked = false;
    const pastedItem = { ...item, path: item.destination, isChecked: false };
    this._listItems.unshift(pastedItem);
    this.requestUpdate();
  }

  async handlePaste() {
    // Format the destination
    const pasteItems = this._selectedItems.map((item) => {
      let { name } = item;
      const prefix = item.path.split('/').slice(0, -1).join('/');
      let destination = item.path.replace(prefix, this.fullpath);
      const found = this._listItems.some((listItem) => listItem.path === destination);
      if (found) {
        // Fix path with existing name
        if (item.ext) {
          destination = `${this.fullpath}/${item.name}-copy.${item.ext}`;
        } else {
          destination = `${destination}-copy`;
        }
        // Set name after destination is updated
        name = `${name}-copy`;
      }
      return { ...item, name, destination };
    });

    // Give the operation 2s before showing status overlay.
    const showStatus = setTimeout(() => {
      this.setStatus('Copying', 'Please be patient. Copying items with many children can take time.');
    }, 2000);

    await Promise.all(pasteItems.map(async (item) => {
      await this.handlePasteItem(item);
    }));

    clearTimeout(showStatus);
    this.setStatus();
    this.handleClear();
  }

  async handleDeleteItem(item) {
    let continuation = true;
    let continuationToken;

    while (continuation) {
      const opts = { method: 'DELETE' };

      if (continuationToken) {
        const formData = new FormData();
        formData.append('continuation-token', continuationToken);
        opts.body = formData;
      }

      const resp = await daFetch(`${DA_ORIGIN}/source${item.path}`, opts);
      const json = await resp.json();
      ({ continuationToken } = json);
      if (!continuationToken) continuation = false;
    }

    item.isChecked = false;
    this._listItems = this._listItems.reduce((acc, liItem) => {
      if (liItem.path !== item.path) acc.push(liItem);
      return acc;
    }, []);
    this.requestUpdate();
  }

  async handleDelete() {
    const showStatus = setTimeout(() => {
      this.setStatus('Deleting', 'Please be patient. Deleting items with many children can take time.');
    }, 2000);

    await Promise.all(this._selectedItems.map(async (item) => {
      await this.handleDeleteItem(item);
    }));
    clearTimeout(showStatus);
    this.setStatus();
    this.handleClear();
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
    if (!items) return;

    const entries = [...items].map((item) => item.webkitGetAsEntry());
    const makeBatches = (await import(`${getNx()}/utils/batch.js`)).default;
    const { getFullEntryList, handleUpload } = await import('./helpers/drag-n-drop.js');
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


  toggleViewDeleted(ctrl) {
    this._viewDeleted = ctrl.target.checked;
    this.requestUpdate();
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

  get isSelectAll() {
    const selectCount = this._listItems.filter((item) => item.isChecked).length;
    return selectCount === this._listItems.length && this._listItems.length !== 0;
  }

  get actionBar() {
    return this.shadowRoot?.querySelector('da-actionbar');
  }

  renderEmpty() {
    return html`<div class="empty-list"><h3>Empty</h3></div>`;
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

  renderList(items) {
    return html`
      <div class="da-item-list" role="list">
      ${repeat(items, (item) => item.path, (item, idx) => html`
        <da-list-item
          role="listitem"
          @checked=${(e) => this.handleItemChecked(e, item)}
          @onstatus=${({ detail }) => this.setStatus(detail.text, detail.description, detail.type)}
          allowselect="${this.select ? true : nothing}"
          ischecked="${item.isChecked ? true : nothing}"
          isdeleted="${item.deleted ? true : nothing}"
          rename="${item.rename ? true : nothing}"
          name="${item.name}"
          path="${item.path}"
          date="${item.lastModified}"
          ext="${item.ext}"
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
      <div class="checkbox-wrapper">
        <input type="checkbox" id="select-all" name="select-all" .checked="${this.isSelectAll}" @click="${this.handleCheckAll}">
        <label class="checkbox-label" for="select-all"></label>
      </div>
      <input type="checkbox" name="select" style="display: none;">
    `;
  }

  render() {
    return html`
      <div class="da-browse-panel-header">
        ${this.renderCheckBox()}
        <div class="da-browse-sort">
          <span></span>
          <div class="da-browse-header-container">
            <button class="da-browse-header-name ${this._sortName}" @click=${this.handleNameSort}>Name</button>
          </div>
          <div class="da-browse-header-container">
            <button class="da-browse-header-name ${this._sortDate}" @click=${this.handleDateSort}>Modified</button>
          </div>
        </div>

        <!-- Maybe update rendercheckbox for this? -->
        <div class="checkbox-wrapper">
          <span>🗑️</span>
          <input type="checkbox" id="view-deleted" name="view-deleted" @click="${this.toggleViewDeleted}">
          <label class="checkbox-label" for="view-deleted"></label>
        </div>
        <!-- what is this for?
        <input type="checkbox" name="select" style="display: none;">
        -->
      </div>
      <div class="da-browse-panel" @dragenter=${this.drag ? this.dragenter : nothing} @dragleave=${this.drag ? this.dragleave : nothing}>
        ${this._listItems?.length > 0 ? this.renderList(this._listItems, true) : this.renderEmpty()}
        ${this.drag ? this.renderDropArea() : nothing}
      </div>
      <da-actionbar
        @clearselection=${this.handleClear}
        @rename=${this.handleRename}
        @onpaste=${this.handlePaste}
        @ondelete=${this.handleDelete}
        @onshare=${this.handleShare}
        data-visible="${this._selectedItems?.length > 0}"></da-actionbar>
      ${this._status ? this.renderStatus() : nothing}
      `;
  }
}

customElements.define('da-list', DaList);
