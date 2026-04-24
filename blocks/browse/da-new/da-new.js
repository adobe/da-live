import { LitElement, html } from 'da-lit';
import { saveToDa, sanitizeName } from '../../shared/utils.js';
import { getNx } from '../../../scripts/utils.js';
import { I18nController, t } from '../../shared/i18n.js';
import getEditPath from '../shared.js';

// Styles & Icons
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const STYLE = await getStyle(import.meta.url);

const INPUT_ERROR = 'da-input-error';

export default class DaNew extends LitElement {
  static properties = {
    fullpath: { type: String },
    editor: { type: String },
    permissions: { attribute: false },
    _createShow: { attribute: false },
    _createType: { attribute: false },
    _createFile: { attribute: false },
    _createName: { attribute: false },
    _fileLabel: { attribute: false },
    _externalUrl: { attribute: false },
  };

  // eslint-disable-next-line no-unused-private-class-members
  #i18n = new I18nController(this);

  connectedCallback() {
    this._fileLabel = '';
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
    const normalized = sanitizeName(e.target.value);
    // Explicitly sync the DOM value: when two invalid chars are typed in a
    // row, the sanitized result can be identical to the previous value, so
    // Lit's property binding would not re-render and the raw typed value
    // would remain in the input.
    e.target.value = normalized;
    this._createName = normalized;
    if (e.target.dataset.input === 'name') {
      e.target.classList.remove(INPUT_ERROR);
    }
  }

  handleUrlChange(e) {
    this._externalUrl = e.target.value;
  }

  async handleSave() {
    const nameInput = this.shadowRoot.querySelector('.da-actions-input[data-input="name"]');
    const finalName = sanitizeName(this._createName || '', { trimTrailing: true });
    if (!finalName) {
      if (nameInput) nameInput.classList.add(INPUT_ERROR);
      return;
    }
    this._createName = finalName;
    if (nameInput) nameInput.classList.remove(INPUT_ERROR);

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
    const editPath = getEditPath({ path, ext, editor: this.editor });
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
    if (!this._fileLabel) {
      const label = this.shadowRoot.querySelector('.da-actions-file-label');
      label.classList.add(INPUT_ERROR);
      return false;
    }

    e.preventDefault();
    const formData = new FormData(e.target);
    const split = this._fileLabel.split('.');
    const ext = split.pop();
    const name = sanitizeName(split.join('.'), { allowDot: true, trimTrailing: true });
    const filename = `${name}.${ext}`;
    const path = `${this.fullpath}/${filename}`;

    await saveToDa({ path, formData });

    const item = { name, path, ext };
    this.sendNewItem(item);
    this.resetCreate();
    this.requestUpdate();
    return true;
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
    const fileLabelError = e.target.parentElement.querySelector('.da-actions-file-label.da-input-error');
    if (fileLabelError) fileLabelError.classList.remove(INPUT_ERROR);
  }

  resetCreate(e) {
    if (e) e.preventDefault();
    this._createShow = '';
    this._createName = '';
    this._createType = '';
    this._createFile = '';
    this._fileLabel = '';
    this._externalUrl = '';
    const input = this.shadowRoot.querySelector('.da-actions-input.da-input-error');
    if (input) input.classList.remove(INPUT_ERROR);
  }

  get _disabled() {
    if (!this.permissions) return true;
    return !this.permissions.some((permission) => permission === 'write');
  }

  render() {
    const typeName = this._createType ? t(`browse.new.type.${this._createType}`) : '';
    const fileLabel = this._fileLabel || t('browse.new.file.select');
    return html`
      <div class="da-actions-create ${this._createShow}">
        <button class="da-actions-new-button" @click=${this.handleCreateMenu} ?disabled=${this._disabled}>${t('browse.new.button')}</button>
        <ul class="da-actions-menu">
          <li class=da-actions-menu-item>
            <button data-type=folder @click=${this.handleNewType}>${t('browse.new.type.folder')}</button>
          </li>
          <li class=da-actions-menu-item>
            <button data-type=document @click=${this.handleNewType}>${t('browse.new.type.document')}</button>
          </li>
          <li class=da-actions-menu-item>
            <button data-type=sheet @click=${this.handleNewType}>${t('browse.new.type.sheet')}</button>
          </li>
          <li class=da-actions-menu-item>
            <button data-type=media @click=${this.handleNewType}>${t('browse.new.type.media')}</button>
          </li>
          <li class=da-actions-menu-item>
            <button data-type=link @click=${this.handleNewType}>${t('browse.new.type.link')}</button>
          </li>
        </ul>
        <div class="da-actions-input-container">
          <input type="text" class="da-actions-input" data-input="name" placeholder=${t('browse.new.input.name')} @input=${this.handleNameChange} .value=${this._createName || ''} @keydown=${this.handleKeyCommands}/>
          ${this._createType === 'link' ? html`<input type="text" class="da-actions-input" data-input="url" placeholder=${t('browse.new.input.url')} @input=${this.handleUrlChange} .value=${this._externalUrl || ''} />` : ''}
          <button class="da-actions-button" @click=${this.handleSave}>${t('browse.new.create', { type: typeName })}</button>
          <button class="da-actions-button da-actions-button-cancel" @click=${this.resetCreate}>${t('common.cancel')}</button>
        </div>
        <form enctype="multipart/form-data" class="da-actions-file-container" @submit=${this.handleUpload}>
          <label for="da-actions-file" class="da-actions-file-label">${fileLabel}</label>
          <input type="file" id="da-actions-file" class="da-actions-file" @change=${this.handleAddFile} name="data" />
          <button class="da-actions-button">${t('common.upload')}</button>
          <button class="da-actions-button da-actions-button-cancel" @click=${this.resetCreate}>${t('common.cancel')}</button>
        </form>
      </div>`;
  }
}

customElements.define('da-new', DaNew);
