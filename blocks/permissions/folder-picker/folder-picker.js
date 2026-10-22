import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import getSheet from '../../shared/sheet.js';
import { listFolders as apiListFolders } from '../api.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

const [form, buttons, style] = await Promise.all([
  getSheet(`${getNx2()}/styles/form.css`),
  getSheet(`${getNx2()}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);

/** @typedef {{ path: string, selectedName?: string|null,
 *   items: { name: string, path: string }[] }} FolderColumn */

/**
 * Column folder browser: lists folders under a site, drilling down one
 * column per selection. Emits `folder-select` `{ folder: 'a/b' }` when
 * "Add this folder" is clicked, and `folder-cancel` on Cancel.
 */
class DaFolderPicker extends LitElement {
  static properties = {
    org: { type: String },
    site: { type: String },
    listFolders: { attribute: false },
    _columns: { state: true },
    _selected: { state: true },
    _loading: { state: true },
  };

  constructor() {
    super();
    this.org = '';
    this.site = '';
    this.listFolders = apiListFolders;
    this._columns = [];
    this._selected = '';
    this._loading = false;
    this._requestId = 0;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [form, buttons, style];
    this._init();
  }

  async _init() {
    this._loading = true;
    const items = await this.listFolders(this.org, this.site, '/');
    this._columns = [{ path: '/', items }];
    this._loading = false;
  }

  async _onFolderClick(columnIndex, name) {
    this._requestId += 1;
    const requestId = this._requestId;

    const updated = this._columns
      .slice(0, columnIndex + 1)
      .map((col, i) => (i === columnIndex ? { ...col, selectedName: name } : col));

    const parts = updated.map((col) => col.selectedName).filter(Boolean);
    this._selected = parts.join('/');
    this._columns = updated;
    this._loading = true;

    const subPath = `/${parts.join('/')}/`;
    const subItems = await this.listFolders(this.org, this.site, subPath);
    if (requestId !== this._requestId) return;
    this._columns = subItems.length > 0
      ? [...updated, { path: subPath, items: subItems }]
      : updated;
    this._loading = false;
  }

  _select() {
    if (!this._selected) return;
    this.dispatchEvent(new CustomEvent('folder-select', {
      detail: { folder: this._selected },
      bubbles: true,
      composed: true,
    }));
  }

  _cancel() {
    this.dispatchEvent(new CustomEvent('folder-cancel', { bubbles: true, composed: true }));
  }

  _renderColumn(col, index) {
    const header = col.path === '/' ? this.site : col.path.replace(/^\/|\/$/g, '');
    return html`
      <div class="folder-column">
        <div class="folder-column-header">${header}</div>
        <div class="folder-column-items">
          ${col.items.length === 0 ? html`<div class="folder-empty">No subfolders</div>` : col.items.map((item) => html`
            <button
              type="button"
              class="folder-item nx-action-btn-quiet ${col.selectedName === item.name ? 'folder-item-selected' : ''}"
              @click=${() => this._onFolderClick(index, item.name)}
            >
              <span class="folder-item-name">${item.name}</span>
            </button>
          `)}
        </div>
      </div>`;
  }

  render() {
    return html`
      <div class="folder-picker">
        <div class="folder-picker-path">
          ${this._selected ? html`
            <span class="folder-path-label">Selected:</span>
            <span class="folder-path-value">${this._selected}</span>
          ` : html`
            <span class="folder-path-hint">Click a folder to select it</span>
          `}
        </div>
        <div class="folder-columns-wrap">
          ${this._columns.map((col, i) => this._renderColumn(col, i))}
          ${this._loading ? html`
            <div class="folder-column">
              <div class="folder-column-header">&nbsp;</div>
              <div class="folder-column-items folder-loading-col">Loading…</div>
            </div>
          ` : nothing}
        </div>
        <div class="folder-picker-actions">
          <button
            type="button"
            class="nx-btn-accent"
            ?disabled=${!this._selected || this._loading}
            @click=${() => this._select()}
          >Add this folder</button>
          <button type="button" class="nx-action-btn" @click=${() => this._cancel()}>Cancel</button>
        </div>
      </div>`;
  }
}

if (!customElements.get('da-folder-picker')) {
  customElements.define('da-folder-picker', DaFolderPicker);
}

export default DaFolderPicker;
