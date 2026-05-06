import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../shared/nxutils.js';
import { formatColumnLastModified } from './format.js';
import {
  getIconByExtension,
  isFolder,
  itemRowPathKey,
  ICON_URLS,
} from '../utils.js';

const styles = await loadStyle(import.meta.url);

/** `''` stays empty (e.g. folders); `null` / `undefined` → em dash for missing data. */
function browseCellText(label) {
  if (label === '') return '';
  return label ?? '—';
}

export class NxBrowseList extends LitElement {
  static properties = {
    items: { type: Array },
    currentPathKey: { type: String, attribute: 'current-path-key' },
    _selectedKeys: { state: true },
  };

  willUpdate(changedProperties) {
    if (changedProperties.has('currentPathKey')) {
      this._selectedKeys = [];
      this._emitSelectionChange();
    }
  }

  updated() {
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

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
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
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  _emitSelectionChange() {
    this.dispatchEvent(
      new CustomEvent('nx-browse-selection-change', {
        detail: { selectedKeys: [...(this._selectedKeys ?? [])] },
        bubbles: true,
        composed: true,
      }),
    );
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
    const { items } = this;
    const selectedKeys = this._selectedKeys ?? [];
    const rowKeys = items.map((item) => itemRowPathKey(this.currentPathKey, item));
    const selectedCount = rowKeys.filter((rowKey) => selectedKeys.includes(rowKey)).length;
    const allSelected = items.length > 0 && selectedCount === items.length;

    return html`
      <div class="scroll">
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
              <th class="column-file-name" scope="col">Name</th>
              <th class="column-modified" scope="col">Last modified</th>
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
                  <td class="column-file-name">
                    <span class="filename" title=${item.name || ''}>${item.name}</span>
                  </td>
                  <td class="column-modified" title=${modified.title || nothing}>
                    ${browseCellText(modified.label)}
                  </td>
                </tr>
              `;
            })}
          </tbody>
        </table>
      </div>
    `;
  }
}

if (!customElements.get('nx-browse-list')) {
  customElements.define('nx-browse-list', NxBrowseList);
}
