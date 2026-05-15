import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { formatColumnLastModified } from './format.js';
import {
  getIconByExtension,
  isFolder,
  itemRowPathKey,
  ICON_URLS,
} from '../utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { loadHrefSvg, ICONS_BASE } = await import(`${getNx()}/utils/svg.js`);

const styles = await loadStyle(import.meta.url);
const sortArrowSvg = await loadHrefSvg(`${ICONS_BASE}S2_Icon_ArrowUpSend_20_N.svg`);

/** `''` stays empty (e.g. folders); `null` / `undefined` → em dash for missing data. */
function browseCellText(label) {
  if (label === '') return '';
  return label ?? '—';
}

export class NxBrowseList extends LitElement {
  static properties = {
    items: { type: Array },
    currentPathKey: { type: String, attribute: 'current-path-key' },
    renamingKey: { attribute: false },
    _selectedKeys: { state: true },
    _sort: { state: true },
  };

  willUpdate(changedProperties) {
    if (changedProperties.has('currentPathKey')) {
      this._selectedKeys = [];
      this._emitSelectionChange();
    }
  }

  updated(changed) {
    if (changed.has('renamingKey') && this.renamingKey) {
      const input = this.shadowRoot?.querySelector('.rename-input');
      if (input) {
        input.focus();
        input.select();
      }
    }
    const input = this.shadowRoot?.getElementById('select-all');
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (this.items === undefined) {
      return;
    }
    const { items } = this;
    const selectedKeys = this._selectedKeys ?? [];
    const keys = items.map((item) => itemRowPathKey(this.currentPathKey, item));
    const selectedCount = keys.filter((rowKey) => selectedKeys.includes(rowKey)).length;
    input.indeterminate = selectedCount > 0 && selectedCount < keys.length;
    if (keys.length === 0) {
      input.checked = false;
      input.indeterminate = false;
    }
  }

  get _sortedItems() {
    if (!this.items || !this._sort) return this.items;
    const { col, dir } = this._sort;
    return [...this.items].sort((a, b) => {
      const av = a[col] ?? '';
      const bv = b[col] ?? '';
      if (av > bv) return dir === 'asc' ? 1 : -1;
      if (av < bv) return dir === 'asc' ? -1 : 1;
      return 0;
    });
  }

  _onSortColumn(col) {
    const dir = this._sort?.col === col && this._sort.dir === 'asc' ? 'desc' : 'asc';
    this._sort = { col, dir };
  }

  _ariaSort(col) {
    if (this._sort?.col !== col) return nothing;
    return this._sort.dir === 'asc' ? 'ascending' : 'descending';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  _renderSortIcon(col) {
    const dirClass = this._sort?.col === col ? this._sort.dir : 'none';
    return html`<span class="sort-indicator sort-indicator-${dirClass}" aria-hidden="true">${sortArrowSvg?.cloneNode(true) ?? nothing}</span>`;
  }

  _renderIcon(iconKey) {
    const src = ICON_URLS[iconKey];
    return src ? html`<img src="${src}" aria-hidden="true">` : nothing;
  }

  _onRowActivate(event, item) {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('nx-browse-activate', {
        detail: {
          pathKey: itemRowPathKey(this.currentPathKey, item),
          item,
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey || event.metaKey,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  _emitSelectionChange() {
    const selectedKeys = [...(this._selectedKeys ?? [])];
    const selected = (this.items ?? [])
      .map((item) => ({ key: itemRowPathKey(this.currentPathKey, item), item }))
      .filter(({ key }) => selectedKeys.includes(key));
    this.dispatchEvent(
      new CustomEvent('nx-browse-selection-change', {
        detail: { selected },
        bubbles: true,
        composed: true,
      }),
    );
  }

  clearSelection() {
    this._selectedKeys = [];
    this._emitSelectionChange();
  }

  _onRenameKeydown(e, item) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const newName = e.target.value.trim();
      if (newName && newName !== item.name) {
        this.dispatchEvent(new CustomEvent('nx-browse-rename', {
          detail: { item, newName },
          bubbles: true,
          composed: true,
        }));
      } else {
        this._onRenameBlur();
      }
    } else if (e.key === 'Escape') {
      this._onRenameBlur();
    }
  }

  _onRenameBlur() {
    this.dispatchEvent(new CustomEvent('nx-browse-rename-cancel', { bubbles: true, composed: true }));
  }

  _isRowSelected(key) {
    return (this._selectedKeys ?? []).includes(key);
  }

  _onSelectAllChange(event) {
    event.stopPropagation();
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (this.items === undefined) {
      return;
    }
    const { items } = this;
    const keys = items.map((item) => itemRowPathKey(this.currentPathKey, item));
    this._selectedKeys = input.checked ? [...keys] : [];
    this._emitSelectionChange();
  }

  _onRowCheckboxChange(event, item) {
    event.stopPropagation();
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const key = itemRowPathKey(this.currentPathKey, item);
    const selectedKeys = this._selectedKeys ?? [];
    if (input.checked) {
      this._selectedKeys = selectedKeys.includes(key)
        ? selectedKeys
        : [...selectedKeys, key];
    } else {
      this._selectedKeys = selectedKeys.filter((selectedKey) => selectedKey !== key);
    }
    this._emitSelectionChange();
  }

  render() {
    if (this.items === undefined) {
      return nothing;
    }
    const items = this._sortedItems;
    const selectedKeys = this._selectedKeys ?? [];
    const rowKeys = items.map((item) => itemRowPathKey(this.currentPathKey, item));
    const selectedCount = rowKeys.filter((rowKey) => selectedKeys.includes(rowKey)).length;
    const allSelected = items.length > 0 && selectedCount === items.length;

    return html`
      <table class="sheet" role="table">
        <thead>
          <tr>
            <th class="column-selection" scope="col">
              <label class="check">
                <span class="sr-only">Select all</span>
                <input
                  id="select-all"
                  type="checkbox"
                  .checked=${allSelected}
                  @change=${this._onSelectAllChange}
                />
              </label>
            </th>
            <th class="column-entry-type" scope="col"><span class="sr-only">Type</span></th>
            <th class="column-file-name" scope="col" aria-sort=${this._ariaSort('name')}>
              <button type="button" class="sort-btn" @click=${() => this._onSortColumn('name')}>
                Name${this._renderSortIcon('name')}
              </button>
            </th>
            <th class="column-modified" scope="col" aria-sort=${this._ariaSort('lastModified')}>
              <button type="button" class="sort-btn" @click=${() => this._onSortColumn('lastModified')}>
                Last modified${this._renderSortIcon('lastModified')}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => {
      const key = itemRowPathKey(this.currentPathKey, item);
      const selected = this._isRowSelected(key);
      const folder = isFolder(item);
      const modified = folder
        ? { label: '' }
        : formatColumnLastModified(item.lastModified);
      const rowKind = folder ? 'row-dir' : 'row-file';
      return html`
              <tr
                class="row ${rowKind}"
                aria-selected=${selected ? 'true' : 'false'}
                @click=${(event) => this._onRowActivate(event, item)}
              >
                <td class="column-selection" @click=${(event) => event.stopPropagation()}>
                  <label class="check">
                    <span class="sr-only">Select ${item.name || 'row'}</span>
                    <input
                      type="checkbox"
                      .checked=${selected}
                      @change=${(event) => this._onRowCheckboxChange(event, item)}
                    />
                  </label>
                </td>
                <td class="column-entry-type">${this._renderIcon(getIconByExtension(item?.ext))}</td>
                <td class="column-file-name" @click=${key === this.renamingKey ? (e) => e.stopPropagation() : nothing}>
                  ${key === this.renamingKey ? html`
                    <input
                      class="rename-input"
                      type="text"
                      .value=${item.name}
                      autocomplete="off"
                      @keydown=${(e) => this._onRenameKeydown(e, item)}
                      @blur=${() => this._onRenameBlur()}
                    >
                  ` : html`
                    <span class="filename" title=${item.name || ''}>${item.name}</span>
                  `}
                </td>
                <td class="column-modified" title=${modified.title || nothing}>
                  ${browseCellText(modified.label)}
                </td>
              </tr>
            `;
    })}
        </tbody>
      </table>
    `;
  }
}

if (!customElements.get('nx-browse-list')) {
  customElements.define('nx-browse-list', NxBrowseList);
}
