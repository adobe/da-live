import { LitElement, html, nothing } from '../../../deps/lit/lit-core.min.js';
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

    if (props.has('fullpath') && this.fullpath) {
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

  async getList() {
    const resp = await daFetch(`${DA_ORIGIN}/list${this.fullpath}`);
    if (!resp.ok) return null;
    return resp.json();
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

  handleItemChecked(e, item) {
    if (e.detail.checked) {
      item.isChecked = true;
    } else {
      item.isChecked = false;
      item.rename = false;
    }
    this._selectedItems = this._listItems.filter((lItem) => lItem.isChecked);
    // If more than one item is selected, force everything to not be in a rename state
    if (this._selectedItems.length > 1) {
      this._listItems.forEach((lItem) => { lItem.rename = false; });
    }

    this.actionBar.items = this._selectedItems;
    this.requestUpdate();
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
        ${items.map((item, idx) => html`
          <da-list-item
            role="listitem"
            @checked=${(e) => this.handleItemChecked(e, item)}
            @onstatus=${({ detail }) => this.setStatus(detail.text, detail.description, detail.type)}
            allowselect="${this.select ? true : nothing}"
            ischecked="${item.isChecked ? true : nothing}"
            rename="${item.rename ? true : nothing}"
            name="${item.name}"
            path="${item.path}"
            date="${item.lastModified}"
            ext="${item.ext}"
            idx=${idx}>
          </da-list-item>
        `)}
      </div>`;
  }

  renderDropArea() {
    return html`
      <div class="da-drop-area" data-message=${this._dropMessage} @dragover=${this.dragover} @drop=${this.drop}></div>`;
  }

  render() {
    return html`
      <div class="da-browse-panel" @dragenter=${this.drag ? this.dragenter : nothing} @dragleave=${this.drag ? this.dragleave : nothing}>
        ${this._listItems?.length > 0 ? this.renderList(this._listItems, true) : this.renderEmpty()}
        ${this.drag ? this.renderDropArea() : nothing}
      </div>
      <da-actionbar
        @clearselection=${this.handleClear}
        @rename=${this.handleRename}
        @onpaste=${this.handlePaste}
        @ondelete=${this.handleDelete}
        data-visible="${this._selectedItems?.length > 0}"></da-actionbar>
      ${this._status ? this.renderStatus() : nothing}
      `;
  }
}

customElements.define('da-list', DaList);
