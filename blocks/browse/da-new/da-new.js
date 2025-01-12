import { LitElement, html, nothing } from 'da-lit';
import { saveToDa } from '../../shared/utils.js';
import { getNx } from '../../../scripts/utils.js';
import getEditPath from '../shared.js';

// Styles & Icons
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const STYLE = await getStyle(import.meta.url);

export default class DaNew extends LitElement {
  static properties = {
    fullpath: { type: String },
    permissions: { attribute: false },
    _createShow: { attribute: false },
    _createType: { attribute: false },
    _createFile: { attribute: false },
    _createName: { attribute: false },
    _fileLabel: { attribute: false },
    _externalUrl: { attribute: false },
  };

  connectedCallback() {
    this._fileLabel = 'Select file';
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [STYLE];
  }

  sendNewItem(item) {
    const opts = { detail: { item }, bubbles: true, composed: true };
    const event = new CustomEvent('newitem', opts);
    this.dispatchEvent(event);
  }

  handleCreateMenu() {
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
    this._createName = e.target.value.replaceAll(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  }

  handleUrlChange(e) {
    this._externalUrl = e.target.value;
  }

  async handleSave() {
    let ext;
    let formData;
    switch (this._createType) {
      case 'document':
        ext = 'html';
        break;
      case 'sheet':
        ext = 'json';
        break;
      case 'link':
        ext = 'link';
        formData = new FormData();
        formData.append(
          'data',
          new Blob([JSON.stringify({ externalUrl: this._externalUrl })], { type: 'application/json' }),
        );
        break;
      default:
        break;
    }
    let path = `${this.fullpath}/${this._createName}`;
    if (ext) path += `.${ext}`;
    const editPath = getEditPath({ path, ext });
    if (ext && ext !== 'link') {
      window.location = editPath;
    } else {
      await saveToDa({ path, formData });
      const item = { name: this._createName, path };
      if (ext) item.ext = ext;
      this.sendNewItem(item);
    }
    this.resetCreate();
  }

  async handleUpload(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const split = this._fileLabel.split('.');
    const ext = split.pop();
    const name = split.join('.').replaceAll(/\W+/g, '-').toLowerCase();
    const filename = `${split.join('.').replaceAll(/\W+/g, '-').toLowerCase()}.${ext}`;
    const path = `${this.fullpath}/${filename}`;

    await saveToDa({ path, formData });

    const item = { name, path, ext };
    this.sendNewItem(item);
    this.resetCreate();
    this.requestUpdate();
  }

  handleKeyCommands(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.handleSave();
    } else if (event.key === 'Escape') {
      this.resetCreate();
    }
  }

  handleAddFile(e) {
    this._fileLabel = e.target.files[0].name;
  }

  resetCreate(e) {
    if (e) e.preventDefault();
    this._createShow = '';
    this._createName = '';
    this._createType = '';
    this._createFile = '';
    this._fileLabel = 'Select file';
    this._externalUrl = '';
  }

  get _disabled() {
    if (!this.permissions) return true;
    return !this.permissions.some((permission) => permission === 'write');
  }

  render() {
    return html`
      <div class="da-actions-create ${this._createShow}">
        <button class="da-actions-new-button" @click=${this.handleCreateMenu} ?disabled=${this._disabled}>New</button>
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
          <li class=da-actions-menu-item>
            <button data-type=link @click=${this.handleNewType}>Link</button>
          </li>
        </ul>
        <div class="da-actions-input-container">
          <input type="text" class="da-actions-input" placeholder="name" @input=${this.handleNameChange} .value=${this._createName || ''} @keydown=${this.handleKeyCommands}/>
          ${this._createType === 'link' ? html`<input type="text" class="da-actions-input" placeholder="url" @input=${this.handleUrlChange} .value=${this._externalUrl || ''} />` : ''}
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
}

customElements.define('da-new', DaNew);
