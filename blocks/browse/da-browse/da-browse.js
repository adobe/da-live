import { LitElement, html, nothing } from '../../../deps/lit/lit-core.min.js';
import { DA_ORIGIN } from '../../shared/constants.js';
import inlinesvg from '../../shared/inlinesvg.js';
import { saveToDa, daFetch } from '../../shared/utils.js';
import { getNx } from '../../../scripts/utils.js';

// Components
import './da-search.js';

// Styles
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const style = await getStyle(import.meta.url);

// Icons
const ICONS = ['/blocks/browse/da-browse/img/Smock_Settings_18_N.svg'];

export default class DaBrowse extends LitElement {
  static properties = {
    details: { attribute: false },
    searchItems: { attribute: false },
    _tabItems: { state: true },
    _listItems: { state: true },
    _selectedItems: { state: true },
    _breadcrumbs: {},
    _createShow: { state: true },
    _createType: { state: true },
    _createName: { state: true },
    _createFile: { state: true },
    _fileLabel: { state: true },
    _canPaste: {},
  };

  constructor() {
    super();
    this.searchItems = [];
    this._selectedItems = [];
    this._createShow = '';
    this._createName = '';
    this._createFile = '';
    this._fileLabel = 'Select file';
    this._tabItems = [
      { id: 'browse', label: 'Browse', selected: true },
      { id: 'search', label: 'Search', selected: false },
    ];
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    inlinesvg({ parent: this.shadowRoot, paths: ICONS });
  }

  async getList() {
    const resp = await daFetch(`${DA_ORIGIN}/list${this.details.fullpath}`);
    if (!resp.ok) return null;
    return resp.json();
  }

  getBreadcrumbs() {
    const pathSplit = this.details.fullpath.split('/').filter((part) => part !== '');
    return pathSplit.map((part, idx) => ({
      name: part,
      path: `#/${pathSplit.slice(0, idx + 1).join('/')}`,
    }));
  }

  showCreateMenu() {
    this._createShow = this._createShow === 'menu' ? '' : 'menu';
  }

  handleNewType(e) {
    this._createShow = e.target.dataset.type === 'media' ? 'upload' : 'input';
    this._createType = e.target.dataset.type;
    setTimeout(() => {
      const input = this.shadowRoot.querySelector('.da-actions-input');
      input.focus();
    }, 500);
  }

  handleNameChange(e) {
    this._createName = e.target.value.replaceAll(/\W+/g, '-').toLowerCase();
  }

  handleAddFile(e) {
    this._fileLabel = e.target.files[0].name;
  }

  async handleSave() {
    let ext;
    switch (this._createType) {
      case 'document':
        ext = 'html';
        break;
      case 'sheet':
        ext = 'json';
        break;
      default:
        break;
    }
    let path = `${this.details.fullpath}/${this._createName}`;
    if (ext) path += `.${ext}`;
    const editPath = this.getEditPath({ path, ext });
    if (ext) {
      window.location = editPath;
    } else {
      await saveToDa({ path });
      const item = { name: this._createName, path };
      if (ext) item.ext = ext;
      this._listItems.unshift(item);
    }
    this.resetCreate();
    this.requestUpdate();
  }

  getEditPath({ path, ext }) {
    // Remove external traces of html/json when constructing the edit path
    if (ext === 'html' || ext === 'json') {
      const route = ext === 'html' ? 'edit' : 'sheet';
      const lastIndex = path.lastIndexOf(`.${ext}`);
      return `/${route}#${path.substring(0, lastIndex)}`;
    }
    return `/media#${path}`;
  }

  async handleUpload(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const split = this._fileLabel.split('.');
    const ext = split.pop();
    const name = split.join('.').replaceAll(/\W+/g, '-').toLowerCase();
    const filename = `${split.join('.').replaceAll(/\W+/g, '-').toLowerCase()}.${ext}`;
    const path = `${this.details.fullpath}/${filename}`;

    await saveToDa({ path, formData });

    const item = { name, path, ext };
    this._listItems.unshift(item);
    this.resetCreate();
    this.requestUpdate();
  }

  resetCreate(e) {
    if (e) e.preventDefault();
    this._createShow = '';
    this._createName = '';
    this._createType = '';
    this._createFile = '';
    this._fileLabel = 'Select file';
  }

  async update(props) {
    if (props.has('details')) {
      this._listItems = await this.getList();
      this._breadcrumbs = this.getBreadcrumbs();
    }
    super.update(props);
  }

  toggleChecked(item) {
    item.isChecked = !item.isChecked;
    if (item.isChecked) {
      this._selectedItems.push(item);
    } else {
      this._selectedItems = this._selectedItems.reduce((acc, selItem) => {
        if (selItem.path !== item.path) acc.push(selItem);
        return acc;
      }, []);
    }
    this.requestUpdate();
  }

  clearSelection() {
    this._selectedItems = [];
    this._listItems = this._listItems.map((item) => ({ ...item, isChecked: false }));
  }

  handleCopy() {
    this._canPaste = true;
  }

  async handlePaste() {
    this._selectedItems = this._selectedItems.map((item) => {
      const prefix = item.path.split('/').slice(0, -1).join('/');
      const destination = item.path.replace(prefix, this.details.fullpath);
      return { ...item, destination };
    });

    for (const item of this._selectedItems) {
      const formData = new FormData();
      formData.append('destination', item.destination);
      const opts = { method: 'POST', body: formData };
      await daFetch(`${DA_ORIGIN}/copy${item.path}`, opts);
      item.isChecked = false;
      this._listItems.unshift(item);
      this.requestUpdate();
    }
    this._canPaste = false;
  }

  async handleDelete() {
    for (const item of this._selectedItems) {
      const opts = { method: 'DELETE' };
      await daFetch(`${DA_ORIGIN}/source${item.path}`, opts);
      item.isChecked = false;
      this._listItems = this._listItems.reduce((acc, liItem) => {
        if (liItem.path !== item.path) acc.push(liItem);
        return acc;
      }, []);
      this.requestUpdate();
    }
    this._selectedItems = [];
    this._canPaste = false;
  }

  handleTab(idx) {
    const current = this._tabItems.find((item) => item.selected);
    if (this._tabItems[idx].id === current.id) return;
    this._tabItems.forEach((item) => {
      item.selected = false;
    });
    this._tabItems[idx].selected = true;
    this._tabItems = [...this._tabItems];
  }

  handeSearchList(e) {
    this.searchItems = e.detail.items;
  }

  renderConfig(length, crumb, idx) {
    if (this.details.depth <= 2 && idx + 1 === length) {
      return html`
        <a class="da-breadcrumb-list-item-config"
           href="/config${crumb.path}/"
           aria-label="Config">
           <svg class="da-breadcrumb-list-item-icon"><use href="#spectrum-settings"/></svg>
           </a>`;
    }
    return null;
  }

  handleKeyCommands(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.handleSave();
    } else if (event.key === 'Escape') {
      this.resetCreate();
    }
  }

  renderNew() {
    return html`
      <div class="da-actions-create ${this._createShow}">
        <button class="da-actions-new-button" @click=${this.showCreateMenu}>New</button>
        <ul class="da-actions-menu">
          <li class=da-actions-menu-item>
            <button data-type=folder @click=${this.handleNewType}>Folder</button>
          </li>
          <li class=da-actions-menu-item>
            <button data-type=document @click=${this.handleNewType}>Document</button>
          </li>
          <li class=da-actions-menu-item>
            <button data-type=sheet @click=${this.handleNewType}>Sheet</button>
          </li>
          <li class=da-actions-menu-item>
            <button data-type=media @click=${this.handleNewType}>Media</button>
          </li>
        </ul>
        <div class="da-actions-input-container">
          <input type="text" class="da-actions-input" placeholder="Name" @input=${this.handleNameChange} .value=${this._createName} @keydown=${this.handleKeyCommands}/>
          <button class="da-actions-button" @click=${this.handleSave}>Create ${this._createType}</button>
          <button class="da-actions-button da-actions-button-cancel" @click=${this.resetCreate}>Cancel</button>
        </div>
        <form enctype="multipart/form-data" class="da-actions-file-container" @submit=${this.handleUpload}>
          <label for="da-actions-file" class="da-actions-file-label">${this._fileLabel}</label>
          <input type="file" id="da-actions-file" class="da-actions-file" @change=${this.handleAddFile} name="data" />
          <button class="da-actions-button">Upload</button>
          <button class="da-actions-button da-actions-button-cancel" @click=${this.resetCreate}>Cancel</button>
        </form>
      </div>`;
  }

  actionBar() {
    return html`
      <div class="da-action-bar">
        <div class="da-action-bar-left-rail">
          <button
            class="close-circle"
            @click=${this.clearSelection}
            aria-label="Unselect items">
            <img src="/blocks/browse/da-browse/img/CrossSize200.svg" />
          </button>
          <span>${this._selectedItems.length} selected</span>
        </div>
        <div class="da-action-bar-right-rail">
          <button
            @click=${this.handleCopy}
            class="copy-button ${this._canPaste ? 'hide-button' : ''}">
            <img src="/blocks/browse/da-browse/img/Smock_Copy_18_N.svg" />
            <span>Copy</span>
          </button>
          <button
            @click=${this.handlePaste}
            class="copy-button ${this._canPaste ? '' : 'hide-button'}">
            <img src="/blocks/browse/da-browse/img/Smock_Copy_18_N.svg" />
            <span>Paste</span>
          </button>
          <button
            @click=${this.handleDelete}
            class="delete-button">
            <img src="/blocks/browse/da-browse/img/Smock_Delete_18_N.svg" />
            <span>Delete</span>
          </button>
        </div>
      </div>`;
  }

  listView(items, allowSelect) {
    return html`
      <ul class="da-item-list">
        ${items.map((item, idx) => html`
          <li class="da-item-list-item">
            <div class="da-item-list-item-inner">
              ${allowSelect ? html`
                <div class="checkbox-wrapper">
                  <input type="checkbox" name="item-selected" id="item-selected-${idx}" .checked="${item.isChecked}" @click="${() => { this.toggleChecked(item); }}">
                  <label class="checkbox-label" for="item-selected-${idx}"></label>
                </div>
                <input type="checkbox" name="select" style="display: none;">
              ` : nothing}
              <a href="${item.ext ? this.getEditPath(item) : `#${item.path}`}" class="da-item-list-item-title">
                <span class="da-item-list-item-type ${item.ext ? 'da-item-list-item-type-file' : 'da-item-list-item-type-folder'} ${item.ext ? `da-item-list-item-icon-${item.ext}` : ''}">
                </span>${item.name}
              </a>
            </div>
          </li>
        `)}
      </ul>`;
  }

  emptyView() {
    return html`<div class="empty-list"><h3>Empty</h3></div>`;
  }

  renderSearch() {
    return html`<da-search @updated=${this.handeSearchList} path=${this.details.fullpath} />`;
  }

  renderBreadCrumbs() {
    return html`
      <div class="da-breadcrumb">
        <ul class="da-breadcrumb-list">
          ${this._breadcrumbs.map((crumb, idx) => html`
            <li class="da-breadcrumb-list-item">
              <div class=da-breadcrumb-list-item-link-wrapper>
                <a href="${crumb.path}">${crumb.name}</a>
                ${this.renderConfig(this._breadcrumbs.length, crumb, idx)}
                </a>
            </li>
          `)}
        </ul>
        ${this._tabItems[0].selected
    ? this.renderNew()
    : this.renderSearch()}
      </div>
    `;
  }

  renderSearchList() {
    return html`${this.searchItems?.length > 0 ? this.listView(this.searchItems, false) : this.emptyView()}`;
  }

  renderBrowse() {
    return html`${this._listItems?.length > 0 ? this.listView(this._listItems, true) : this.emptyView()}`;
  }

  render() {
    return html`
      <div class="da-browse-tab-list">
        <div class="da-browse-tab-header">
          ${this._tabItems.map((tab, idx) => html`
            <button id="da-browse-tab-button-${tab.id}" @click=${() => this.handleTab(idx)} role="tab" aria-selected="${tab.selected}" aria-controls="tabpanel-${tab.id}">
              <h2>${tab.label}</h2>
            </button>
          `)}
        </div>
        <div class="da-browse-tab-content">
          ${this.renderBreadCrumbs()}
          ${this._tabItems.map((tab) => html`
            <div class="da-browse-tab-panel${tab.selected ? ' da-browse-tab-panel-active' : ''}" role="tabpanel" id="tabpanel-${tab.id}" aria-labelledby="da-browse-tab-button-${tab.id}">
              ${tab.id === 'browse' ? this.renderBrowse() : this.renderSearchList()}
            </div>
          `)}
        </div>
      </div>
      ${this._selectedItems?.length > 0 ? html`${this.actionBar()}` : ''}
    `;
  }
}

customElements.define('da-browse', DaBrowse);
