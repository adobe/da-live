import { html, repeat, nothing } from 'da-lit';
import { getTypeLabel } from '../../../shared/icons.js';
import { getNx, getNx2 } from '../../../../scripts/utils.js';
import DaListBase from '../../da-list-base/da-list-base.js';

import '../da-list-item/da-list-item.js';

await import(`${getNx()}/blocks/shared/popover/popover.js`);

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const [FORM, STYLE] = await Promise.all([
  loadStyle(`${getNx2()}/styles/form.css`),
  loadStyle(import.meta.url),
]);

function pluralizeTypeLabel(label, count) {
  return count === 1 ? label : `${label}s`;
}

function toggleInSet(set, value) {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
}

function sortTypeLabels(labels) {
  return [...labels].sort((a, b) => {
    if (a === 'Folder') return -1;
    if (b === 'Folder') return 1;
    return a.localeCompare(b);
  });
}

const TYPE_TAG_CLASSES = {
  Folder: 'folder',
  Page: 'page',
  Image: 'image',
  Video: 'video',
  Link: 'link',
  Sheet: 'sheet',
};

function tagClassForTypeLabel(label) {
  return TYPE_TAG_CLASSES[label] || '';
}

export default class DaList extends DaListBase {
  static sheets = [FORM, STYLE];

  static properties = {
    ...DaListBase.properties,
    sortPreference: { attribute: false },
    groupByType: { type: Boolean },
    view: { type: String },
    _collapsedTypes: { state: true },
    _hiddenTypes: { state: true },
    _sort: { state: true },
    _sorting: { state: true },
  };

  constructor() {
    super();
    this._collapsedTypes = new Set();
    this._hiddenTypes = new Set();
  }

  async loadDialog() {
    await import('../../../shared/da-confirm-dialog/da-confirm-dialog.js');
  }

  renderDialog({ title, message, action, onClose }, content) {
    return html`
      <da-confirm-dialog title=${title} .message=${message} .action=${action} @close=${onClose}>
        ${content}
      </da-confirm-dialog>
    `;
  }

  renderYesInput() {
    return html`
      <input
        class="nx-input"
        type="text"
        placeholder="YES"
        autofocus
        @input=${this.upperCaseConfirm}
        aria-label="Type YES to confirm"
        value=${this._confirmText ?? ''}>
    `;
  }

  renderUnpublishToggle() {
    return html`
      <label class="nx-checkbox">
        <input
          type="checkbox"
          name="confirm-unpublish"
          .checked=${this._unpublish}
          @change=${(e) => { this._unpublish = e.target.checked; }}>
        Unpublish ${this._itemString}
      </label>
    `;
  }

  afterListChange() {
    const { property, direction } = this.sortState;
    if (property) this.handleSort(direction, property);
  }

  updated(changedProps) {
    super.updated(changedProps);
    if (changedProps.has('_sort') || changedProps.has('_sorting') || changedProps.has('_bulkLoading')) {
      this.notifySortState();
    }
    if (changedProps.has('_hiddenTypes') || changedProps.has('_listItems')) this.notifyTypesFilter();
  }

  async update(props) {
    // List Items can be provided externally (via search)
    if (props.has('listItems') && this.listItems) {
      this._listItems = this.listItems;
      this.resetListItemPaths(this._listItems);
      this.applyFavoritesToItems(this._listItems);
      this.applyFavoriteOrder();
    }

    if (props.has('fullpath') && this.fullpath) {
      const path = this.fullpath;
      this._sort = undefined;
      this.notifySortState();
      this._allPagesLoaded = false;
      // Resolve the delete allowlist alongside the listing so the action bar's
      // Delete button is decided before any selection can surface it. The site
      // config is already warm (da-browse fetches it first) so this is cheap.
      this._directoryReady = Promise.all([this.getList(), this.updateDeletePermission()]);
      const [items] = await this._directoryReady;
      if (path !== this.fullpath) {
        super.update(props);
        return;
      }
      this._listItems = items;
      if (this.sort && this.sortPreference) {
        await this.setSort(this.sortPreference.property, this.sortPreference.direction);
      }
      this.notifySortState();
    }

    if (props.has('newItem') && this.newItem) {
      this.handleNewItem();
    }

    super.update(props);
  }

  get items() {
    return this._listItems;
  }

  async getDirectorySnapshot() {
    await this.updateComplete;
    await this._directoryReady;
    if (this._directoryError) throw new Error(this._directoryError);
    return {
      fullpath: this.fullpath,
      items: this._listItems,
      version: this._listItems,
      continuationToken: this._continuationToken,
      complete: this._allPagesLoaded,
    };
  }

  handleItemChecked(e, item, index) {
    const visibleItems = this.groupedItems
      .filter(({ label }) => !this._collapsedTypes.has(label))
      .flatMap((group) => group.items);
    const previousIndex = visibleItems.indexOf(this._listItems[this._lastCheckedIndex]);
    const currentIndex = visibleItems.indexOf(item);
    if (e.detail.shiftKey && previousIndex >= 0 && currentIndex >= 0) {
      const start = Math.min(previousIndex, currentIndex);
      const end = Math.max(previousIndex, currentIndex);

      for (let i = start; i <= end; i += 1) {
        visibleItems[i].isChecked = e.detail.checked;
      }
      this._lastCheckedIndex = index;
    } else {
      item.isChecked = e.detail.checked;
      this._lastCheckedIndex = e.detail.checked ? index : null;
    }

    if (!e.detail.checked) {
      item.rename = false;
    }

    this.handleSelectionState();
  }

  // Timers that touch component state are cancelled on disconnect.
  handleSort(direction, prop) {
    const first = direction === 'ascending' ? 1 : -1;
    const last = -first;

    const sortFn = this.getSortFn(first, last, prop);
    this._listItems.sort(sortFn);
    this.applyFavoriteOrder();
    this._sort = { property: prop, direction };
    this._lastCheckedIndex = null;
    this.requestUpdate();
  }

  get sortState() {
    return {
      property: this._sort?.property ?? null,
      direction: this._sort?.direction ?? 'none',
      loading: !!this._sorting,
    };
  }

  async setSort(property, direction) {
    if (this._sorting || this._bulkLoading) return;
    const path = this.fullpath;
    this._sorting = true;
    try {
      await this.ensureAllPagesLoadedForSort();
      if (path !== this.fullpath) return;
      if (this._continuationToken && !this._allPagesLoaded) {
        this.setStatus('Could not sort all files', 'Loading the remaining files did not complete. Please try again.', 'error');
        return;
      }
      this.handleSort(direction, property);
    } finally {
      this._sorting = false;
    }
  }

  notifySortState() {
    this.dispatchEvent(new CustomEvent('sortchange', {
      detail: { ...this.sortState, loading: !!this._sorting || !!this._bulkLoading },
      bubbles: true,
      composed: true,
    }));
  }

  async toggleSort(property) {
    const descending = this._sort?.property === property && this._sort.direction === 'descending';
    await this.setSort(property, descending ? 'ascending' : 'descending');
  }

  sortDirectionFor(property) {
    return this._sort?.property === property ? this._sort.direction : 'none';
  }

  renderSortIcon() {
    return html`
      <svg class="da-browse-sort-icon" viewBox="0 0 20 20" aria-hidden="true">
        <use class="ascending" href="/img/icons/s2-icon-sortup-20-n.svg#icon"></use>
        <use class="descending" href="/img/icons/s2-icon-sortdown-20-n.svg#icon"></use>
      </svg>
    `;
  }

  get sortPillLabel() {
    const { property, direction } = this._sort ?? {};
    if (!property || direction === 'none') return 'Sort: Default';
    const name = property === 'name';
    const asc = direction === 'ascending';
    const labels = name ? ['A-Z', 'Z-A'] : ['oldest first', 'newest first'];
    const detail = labels[asc ? 0 : 1];
    return `Sorted by ${name ? 'Name' : 'Modified'} (${detail})`;
  }

  get selectableItems() {
    return this.filteredItems;
  }

  get filteredItems() {
    return this._hiddenTypes.size
      ? this._listItems.filter((item) => !this._hiddenTypes.has(getTypeLabel(item.ext)))
      : this._listItems;
  }

  get allTypeLabels() {
    return sortTypeLabels(new Set(this._listItems.map((item) => getTypeLabel(item.ext))));
  }

  get groupedItems() {
    const items = this.filteredItems;
    if (!this.groupByType) return [{ label: null, items }];

    const buckets = new Map();
    items.forEach((item) => {
      const label = getTypeLabel(item.ext);
      if (!buckets.has(label)) buckets.set(label, []);
      buckets.get(label).push(item);
    });

    return sortTypeLabels(buckets.keys()).map((label) => ({ label, items: buckets.get(label) }));
  }

  toggleTypeGroup(label) {
    this._collapsedTypes = toggleInSet(this._collapsedTypes, label);
  }

  get _typesPopover() {
    return this.shadowRoot.querySelector('.da-list-types-popover');
  }

  async toggleTypesPopover(anchor) {
    const popover = this._typesPopover;
    if (popover.open) {
      popover.close();
      return;
    }
    popover.show({ anchor });
    this.notifyTypesFilter();
    await this.loadAllPagesBulk();
  }

  notifyTypesFilter() {
    this.dispatchEvent(new CustomEvent('typesfilterchange', {
      detail: {
        open: !!this._typesPopover?.open,
        hiddenCount: this.allTypeLabels.filter((label) => this._hiddenTypes.has(label)).length,
      },
      bubbles: true,
      composed: true,
    }));
  }

  toggleTypeVisibility(label) {
    this._hiddenTypes = toggleInSet(this._hiddenTypes, label);
    this.handleSelectionState();
  }

  toggleAllTypesVisibility() {
    this._hiddenTypes = this._hiddenTypes.size ? new Set() : new Set(this.allTypeLabels);
    this.handleSelectionState();
  }

  getGroupItems(label) {
    return this.groupedItems.find((group) => group.label === label)?.items || [];
  }

  async handleGroupCheckAll(label) {
    const items = this.getGroupItems(label);
    const check = items.some((item) => !item.isChecked);

    if (check) await this.loadAllPagesBulk();

    this.getGroupItems(label).forEach((item) => { item.isChecked = check; });
    this.handleSelectionState();
  }

  renderGroupItems(items, indexByPath) {
    const rows = this.renderGroupRows(items, indexByPath);
    return this.view === 'card' ? html`<div class="da-card-grid" role="presentation">${rows}</div>` : rows;
  }

  renderGroupRows(items, indexByPath) {
    return repeat(items, (item) => item.path, (item) => {
      const idx = indexByPath.get(item.path);
      return html`
        <da-list-item
          role="row"
          @checked=${(e) => this.handleItemChecked(e, item, idx)}
          @onstatus=${({ detail }) => this.setStatus(detail.text, detail.description, detail.type)}
          @renamecompleted=${(e) => this.handleRenameCompleted(e)}
          allowselect="${this.select ? true : nothing}"
          view="${this.view === 'card' ? 'card' : nothing}"
          ischecked="${item.isChecked ? true : nothing}"
          isfavorited="${item.isFavorited ? true : nothing}"
          rename="${item.rename ? true : nothing}"
          name="${item.name}"
          path="${item.path}"
          date="${item.lastModified}"
          ext="${item.ext}"
          editor="${this.editor}"
          idx=${idx}>
        </da-list-item>`;
    });
  }

  renderGroupHeader(label, groupItems) {
    const collapsed = this._collapsedTypes.has(label);
    const count = groupItems.length;
    const checkedCount = groupItems.filter((item) => item.isChecked).length;
    const isGroupSelectAll = count > 0 && checkedCount === count;
    const isGroupIndeterminate = checkedCount > 0 && checkedCount < count;
    const typeLabel = pluralizeTypeLabel(label, count);
    return html`
      <div class="da-list-group-header ${collapsed ? 'is-collapsed' : ''}">
        ${this.select ? html`
          <label class="nx-checkbox ${isGroupIndeterminate ? 'indeterminate' : ''} ${this._bulkLoading ? 'loading' : ''}">
            <input
              type="checkbox"
              .checked="${isGroupSelectAll}"
              @click=${() => this.handleGroupCheckAll(label)}
              aria-label="Select all ${typeLabel.toLowerCase()}"
              ?disabled=${this._bulkLoading}
              aria-disabled=${this._bulkLoading ? 'true' : 'false'}>
          </label>
        ` : nothing}
        <button
          type="button"
          class="da-list-group-toggle"
          aria-expanded="${!collapsed}"
          @click=${() => this.toggleTypeGroup(label)}>
          <svg class="da-list-group-chevron" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
          <span class="tag ${tagClassForTypeLabel(label)}">${count} ${typeLabel}</span>
        </button>
      </div>`;
  }

  renderList(items) {
    const showSentinel = this._continuationToken && !this._allPagesLoaded;
    const indexByPath = new Map(this._listItems.map((item, i) => [item.path, i]));
    const groups = this.groupedItems;

    return html`
      <div class="da-item-list" role="presentation">
      ${!this.groupByType
        ? this.renderGroupItems(items, indexByPath)
        : groups.map(({ label, items: groupItems }) => html`
            ${this.renderGroupHeader(label, groupItems)}
            ${!this._collapsedTypes.has(label) ? this.renderGroupItems(groupItems, indexByPath) : nothing}
          `)}
        ${showSentinel ? html`<div class="da-list-sentinel" aria-hidden="true"></div>` : nothing}
      </div>
    `;
  }

  renderCheckBox() {
    return html`
      <label class="nx-checkbox ${this._bulkLoading ? 'loading' : ''} ${this._selectedItems.length > 0 && !this.isSelectAll ? 'indeterminate' : ''}" role="columnheader">
        <input type="checkbox" id="select-all" name="select-all" .checked="${this.isSelectAll}" @click="${this.handleCheckAll}" aria-label="Select all items" ?disabled=${this._bulkLoading} aria-disabled=${this._bulkLoading ? 'true' : 'false'}>
        ${this.view === 'card' ? html`<span class="da-card-select-all-label">Select all</span>` : nothing}
      </label>
    `;
  }

  render() {
    const hasMorePages = this._continuationToken && !this._allPagesLoaded;
    const { filteredItems } = this;
    const showList = filteredItems?.length > 0 || hasMorePages;

    return html`
      <div class="da-browse-panel-header da-browse-table-header ${this.view === 'card' ? 'is-card' : ''}" role="row">
        <div class="da-browse-header-cell da-browse-header-cell-select" data-column="select">
          ${this.renderCheckBox()}
        </div>
        ${this.view === 'card' ? html`<span class="tag da-card-sort-pill">${this.sortPillLabel}</span>` : nothing}
        <div class="da-browse-header-cell da-browse-header-cell-name" data-column="name" role="columnheader" aria-sort="${this.sortDirectionFor('name')}">
          <div class="da-browse-header-container">
            <button
              class="da-browse-header-name ${this.sortDirectionFor('name')} ${this._bulkLoading ? 'loading' : ''}"
              @click=${() => this.toggleSort('name')}
              ?disabled=${this._bulkLoading}
              aria-disabled=${this._bulkLoading ? 'true' : 'false'}>
              Name
              ${this.renderSortIcon()}
            </button>
          </div>
        </div>
        <div class="da-browse-header-cell da-browse-header-cell-type" data-column="type" role="columnheader">Type</div>
        <div class="da-browse-header-cell da-browse-header-cell-modified" data-column="modified" role="columnheader" aria-sort="${this.sortDirectionFor('lastModified')}">
          <div class="da-browse-header-container">
            <button
              class="da-browse-header-name ${this.sortDirectionFor('lastModified')} ${this._bulkLoading ? 'loading' : ''}"
              @click=${() => this.toggleSort('lastModified')}
              ?disabled=${this._bulkLoading}
              aria-disabled=${this._bulkLoading ? 'true' : 'false'}>
              Modified
              ${this.renderSortIcon()}
            </button>
          </div>
        </div>
        <div class="da-browse-header-cell da-browse-header-cell-actions" data-column="actions" aria-hidden="true"></div>
      </div>
      <div class="da-browse-panel ${this.view === 'card' ? 'card-view' : ''}" role="rowgroup" aria-label="File list" @dragenter=${this.drag ? this.dragenter : nothing} @dragleave=${this.drag ? this.dragleave : nothing}>
        ${showList ? this.renderList(filteredItems) : this.renderEmpty()}
        ${this.drag ? this.renderDropArea() : nothing}
      </div>
      <da-actionbar
        class="full-width"
        .permissions=${this._permissions}
        .canDelete=${this._canDelete}
        @clearselection=${this.handleClearSelection}
        @rename=${this.handleRename}
        @onfavorite=${this.handleFavorite}
        @onpaste=${this.handlePaste}
        @ondelete=${this.handleDelete}
        @onpreview=${this.handlePreview}
        @onpublish=${this.handlePublish}
        @onshare=${this.handleShare}
        .loading=${typeof this._aemActionState === 'string' ? this._aemActionState : null}
        .hidePublishConfs=${this.hidePublishConfs}
        currentPath="${this.fullpath}"
        .isHlx6=${this._isHlx6 ?? false}
        role="row"
        data-visible="${this._selectedItems?.length > 0}"></da-actionbar>
      ${this._status ? this.renderStatus() : nothing}
      ${this._aemActionState?.results ? this.renderAemResults() : nothing}
      ${this.renderConfirmDialog()}
      ${this._dropConflicts?.length ? this.renderDropConfirm() : nothing}
      ${!this._confirm && this._itemErrors.length ? this.renderErrors() : nothing}
      ${this.renderTypesPopover()}
      `;
  }

  renderTypesPopover() {
    const labels = this.allTypeLabels;
    const allVisible = this._hiddenTypes.size === 0;

    return html`
      <nx-popover class="da-list-types-popover" role="dialog" aria-label="Show all types"
        aria-busy=${!!this._bulkLoading} @close=${this.notifyTypesFilter}>
        <h4 class="da-list-types-title">Types</h4>
        ${labels.map((label) => html`
          <label class="nx-checkbox da-list-types-row">
            <input
              type="checkbox"
              .checked=${!this._hiddenTypes.has(label)}
              ?disabled=${this._bulkLoading}
              @click=${() => this.toggleTypeVisibility(label)}>
            <span class="tag ${tagClassForTypeLabel(label)}">${label}</span>
          </label>
        `)}
        <div class="da-list-types-row da-list-types-select-all">
          <label class="nx-checkbox">
            <input
              type="checkbox"
              .checked=${allVisible}
              ?disabled=${this._bulkLoading}
              @click=${() => this.toggleAllTypesVisibility()}>
            <span>Select all</span>
          </label>
        </div>
      </nx-popover>`;
  }
}

customElements.define('da-list', DaList);
