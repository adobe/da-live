import { LitElement, html } from 'da-lit';
import { sanitizeName, EMPTY_DOC } from '../../shared/utils.js';
import { getNx, getNx2Api } from '../../../scripts/utils.js';
import getEditPath from '../shared.js';
import '../../shared/da-link-dialog/da-link-dialog.js';
import '../../shared/da-name-dialog/da-name-dialog.js';

// Styles & Icons
const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const [base, STYLE] = await Promise.all([
  loadStyle(new URL('../../shared/styles/base.css', import.meta.url).href),
  loadStyle(import.meta.url),
]);
await import(`${getNx()}/blocks/shared/menu/menu.js`);

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
    _createDialogOpen: { state: true },
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
    this._createDialogOpen = true;
  }

  async _handleCreate(e) {
    const { name: finalName } = e.detail;
    this._createDialogOpen = false;
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
      @close=${this._handleLinkCancel}>
    </da-link-dialog>
    <da-name-dialog
      dialog-title="${this._createDialogTitle}"
      placeholder="${this._createType} name"
      saveLabel="Create"
      ?open=${this._createDialogOpen}
      ?saving=${this._loading}
      @da-name-submit=${this._handleCreate}
      @close=${this._handleCreateDialogClose}>
    </da-name-dialog>`;
  }
}

customElements.define('da-new', DaNew);
