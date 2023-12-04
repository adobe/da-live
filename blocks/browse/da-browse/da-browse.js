import { LitElement, html, map } from '../../../deps/lit/lit-all.min.js';
import { origin } from '../state/index.js';

import getSheet from '../../shared/sheet.js';
import saveToDa from '../../shared/utils.js';
const sheet = await getSheet('/blocks/browse/da-browse/da-browse.css');

export default class DaBrowse extends LitElement {
  static properties = {
    details: {
      attribute: false,
    },
    _listItems: { state: true },
    _breadcrumbs: {},
    _createShow: { state: true },
    _createType: { state: true },
    _createName: { state: true },
  };

  constructor() {
    super();
    this._createShow = '';
    this._createName = '';
  }

  async getList() {
    const resp = await fetch(`${origin}/list${this.details.fullpath}`);
    if (!resp.ok) return;
    return resp.json();
  }

  getBreadcrumbs() {
    const pathSplit = this.details.fullpath.split('/').filter((part) => part !== '');
    return pathSplit.map((part, idx) => {
      return {
        name: part,
        path: `#/${pathSplit.slice(0, idx + 1).join('/')}`,
      }
    });
  }

  crumbClick(idx) {
    // const pathSplit = this.details.fullpath.split('/').filter((part) => part !== '');
    const newCrumbs = idx > -1 ? this._breadcrumbs.slice(0, idx + 1) : [];
    console.log(`/${newCrumbs.join('/')}`);
  }

  showCreateMenu() {
    this._createShow = this._createShow === 'menu' ? '' : 'menu';
  }

  handleNewType(e) {
    this._createShow = 'input';
    this._createType = e.target.dataset.type;
    setTimeout(() => {
      const input = this.shadowRoot.querySelector('.da-actions-input');
      input.focus();
    }, 500);
  }

  handleNameChange(e) {
    this._createName = e.target.value.replaceAll(/\W+/g, '-').toLowerCase();
  }

  async handleSave() {
    const isDoc = this._createType === 'document';
    const ext = isDoc ? 'html' : 'props';
    let path = `${this.details.fullpath}/${this._createName}`;
    if (isDoc) path += `.${ext}`;

    const blob = new Blob([''], { type: 'text/html' });
    await saveToDa({ blob, path, preview: isDoc });

    if (isDoc) {
      const editPath = this.getEditPath(path);
      window.open(editPath, '_blank');
    }

    const item = { name: this._createName, path, isFile: isDoc, ext };
    this._listItems.unshift(item);
    this.resetCreate();
    this.requestUpdate();
  }

  resetCreate() {
    this._createShow = '';
    this._createName = '';
    this._createType = '';
  }

  getEditPath(path) {
    const pathSplit = path.split('.');
    // This will fail spectacularly if there are other periods in the path
    return `/edit#${pathSplit[0]}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  async update(props) {
    if (props.has('details')) {
      this._listItems = await this.getList();
      this._breadcrumbs = this.getBreadcrumbs();
    }
    super.update(props);
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
        </ul>
        <div class="da-actions-input-container">
          <input type="text" class="da-actions-input" placeholder="Name" @input=${this.handleNameChange} .value=${this._createName} />
          <button class="da-actions-button" @click=${this.handleSave}>Create ${this._createType}</button>
          <button class="da-actions-button da-actions-button-cancel" @click=${this.resetCreate}>Cancel</button>
        </div>
      </div>`;
  }

  render() {
    return html`
      <h1>Browse</h1>
      <div class="da-breadcrumb">
        <ul class="da-breadcrumb-list">
          ${map(this._breadcrumbs, (crumb, idx) => html`
            <li class="da-breadcrumb-list-item">
              <a href="${crumb.path}">${crumb.name}</a>
            </li>
          `)}
        </ul>
        ${this.renderNew()}
      </div>
      ${this._listItems.length > 0 ? 
        html`
          <ul class="da-item-list">
            ${map(this._listItems, (item) => html`
              <li class="da-item-list-item">
                <input type="checkbox" name="select" style="display: none;">
                <a href="${item.isFile ? this.getEditPath(item.path) : `/#${item.path}`}" class="da-item-list-item-title">
                  <span class="da-item-list-item-type ${item.isFile ? 'da-item-list-item-type-file' : 'da-item-list-item-type-folder' }">
                  </span>${item.name.split('.')[0]}
                </a>
              </li>
            `)}
          </ul>` : 
        html`<div class="empty-list"><h3>Empty</h3></div>`}`
    }
}

customElements.define('da-browse', DaBrowse);
