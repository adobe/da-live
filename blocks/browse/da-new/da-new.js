import { LitElement, html, nothing } from 'da-lit';
import { sanitizeName } from '../../shared/utils.js';
import { getNx, getNx2Api } from '../../../scripts/utils.js';
import getEditPath from '../shared.js';
import '../../shared/da-link-dialog/da-link-dialog.js';

// Styles & Icons
const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const [base, STYLE] = await Promise.all([
  loadStyle(new URL('../../shared/styles/base.css', import.meta.url).href),
  loadStyle(import.meta.url),
]);
await import(`${getNx()}/blocks/shared/menu/menu.js`);
await import(`${getNx()}/blocks/shared/dialog/dialog.js`);

const EMPTY_DOC = '<body><header></header><main><div></div></main><footer></footer></body>';
const EMPTY_SHEET = JSON.stringify({
  ':type': 'sheet',
  ':sheetname': 'data',
  total: 0,
  limit: 0,
  offset: 0,
  data: [],
});

export default class DaNew extends LitElement {
  static properties = {
    fullpath: { type: String },
    editor: { type: String },
    permissions: { attribute: false },
    _createType: { state: true },
    _createName: { state: true },
    _createDialogOpen: { state: true },
    _nameError: { state: true },
    _linkDialogOpen: { state: true },
    _loading: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [base, STYLE];
  }

  sendNewItem(item) {
    const opts = { detail: { item }, bubbles: true, composed: true };
    const event = new CustomEvent('newitem', opts);
    this.dispatchEvent(event);
  }

  handleNewType(e) {
    const type = e.detail?.id ?? e.target?.dataset?.type;
    if (type === 'link') {
      this._linkDialogOpen = true;
      return;
    }
    if (type === 'media') {
      this.shadowRoot.querySelector('#da-actions-file').click();
      return;
    }
    this._createType = type;
    this._createName = '';
    this._createDialogOpen = true;
  }

  handleNameChange(e) {
    const normalized = sanitizeName(e.target.value);
    // Explicitly sync the DOM value: when two invalid chars are typed in a
    // row, the sanitized result can be identical to the previous value, so
    // Lit's property binding would not re-render and the raw typed value
    // would remain in the input.
    e.target.value = normalized;
    this._nameError = false;
    this._createName = normalized;
  }

  async _handleCreate() {
    const finalName = sanitizeName(this._createName || '', { trimTrailing: true });
    if (!finalName) {
      this._nameError = true;
      return;
    }
    this._nameError = false;
    this._createDialogOpen = false;
    this._createName = '';
    this._loading = true;
    try {
      if (this._createType === 'folder') {
        const path = `${this.fullpath}/${finalName}`;
        const { source } = await getNx2Api();
        await source.createFolder(path);
        this.sendNewItem({ name: finalName, path });
      } else {
        const ext = this._createType === 'document' ? 'html' : 'json';
        const path = `${this.fullpath}/${finalName}.${ext}`;
        const { source } = await getNx2Api();
        const body = ext === 'html' ? EMPTY_DOC : EMPTY_SHEET;
        await source.save(path, { body });
        window.location = getEditPath({ path, ext, editor: this.editor });
      }
    } finally {
      this._loading = false;
    }
  }

  _handleCreateDialogClose() {
    this._createDialogOpen = false;
    this._createName = '';
    this._nameError = false;
  }

  _handleCreateKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this._handleCreate();
    }
  }

  async _handleLinkSubmit(e) {
    const { href, text } = e.detail;
    const name = sanitizeName(text || '', { trimTrailing: true });
    if (!name) return;
    this._loading = true;
    try {
      const path = `${this.fullpath}/${name}.link`;
      const { source } = await getNx2Api();
      await source.save(path, { body: JSON.stringify({ externalUrl: href }) });
      this.sendNewItem({ name, path, ext: 'link' });
      this._linkDialogOpen = false;
    } finally {
      this._loading = false;
    }
  }

  _handleLinkCancel() {
    this._linkDialogOpen = false;
  }

  async handleAddFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    this._loading = true;
    try {
      const split = file.name.split('.');
      const ext = split.pop();
      const name = sanitizeName(split.join('.'), { allowDot: true, trimTrailing: true });
      const path = `${this.fullpath}/${name}.${ext}`;
      const { source } = await getNx2Api();
      await source.save(path, { body: file });
      this.sendNewItem({ name, path, ext });
    } finally {
      this._loading = false;
      e.target.value = '';
    }
  }

  get _disabled() {
    if (!this.permissions) return true;
    return !this.permissions.some((permission) => permission === 'write');
  }

  get _createDialogTitle() {
    const titles = { folder: 'New folder', document: 'New document', sheet: 'New sheet' };
    return titles[this._createType] ?? 'New';
  }

  render() {
    return html`
      <div class="da-actions-create">
        <nx-menu .items=${[
        { id: 'folder', label: 'Folder' },
        { id: 'document', label: 'Document' },
        { id: 'sheet', label: 'Sheet' },
        { id: 'media', label: 'Media' },
        { id: 'link', label: 'Link' },
      ]} @select=${this.handleNewType}>
          <button slot="trigger" class="da-actions-new-button" ?disabled=${this._disabled || this._loading} aria-label="New">
            ${this._loading
        ? html`<span class="da-loading-spinner" aria-hidden="true"></span>`
        : html`<svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-addcircle-20-n.svg#icon"></svg>`}
          </button>
        </nx-menu>
        <input type="file" id="da-actions-file" class="da-actions-file" @change=${this.handleAddFile} />
      </div>
    <da-link-dialog
      dialog-title="Add link"
      saveLabel="Create"
      ?open=${this._linkDialogOpen}
      @da-link-submit=${this._handleLinkSubmit}
      @da-link-cancel=${this._handleLinkCancel}>
    </da-link-dialog>
    ${this._createDialogOpen ? html`
    <nx-dialog title="${this._createDialogTitle}" @close=${this._handleCreateDialogClose}>
      <label class="da-form-field ${this._nameError ? 'da-field-error' : ''}">
        <span>Name</span>
        <input autofocus type="text" class="da-input" placeholder="${this._createType} name"
               .value=${this._createName || ''}
               @input=${this.handleNameChange}
               @keydown=${this._handleCreateKeydown} />
        <span class="da-input-error-msg" role="alert">${this._nameError ? 'Please fill out this field.' : ''}</span>
      </label>
      <button slot="actions" type="button" class="da-btn-secondary" @click=${this._handleCreateDialogClose}>Cancel</button>
      <button slot="actions" type="button" class="da-btn-primary" ?disabled=${this._loading} @click=${this._handleCreate}>Create</button>
    </nx-dialog>` : nothing}`;
  }
}

customElements.define('da-new', DaNew);
