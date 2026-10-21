import { html, nothing, repeat } from 'da-lit';
import { getNx, getNx2 } from '../../../../scripts/utils.js';
import DaListBase from '../../da-list-base/da-list-base.js';

import '../da-list-item/da-list-item.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const SHARED = await loadStyle(`${getNx2()}/styles/form.css`);
const STYLE = await loadStyle(import.meta.url);

export default class DaList extends DaListBase {
  static sheets = [SHARED, STYLE];

  static properties = {
    ...DaListBase.properties,
    _filter: { state: true },
    _showFilter: { state: true },
    _filterLoading: { state: true },
  };

  constructor() {
    super();
    this._filter = '';
  }

  async loadDialog() {
    await import('../../../shared/da-dialog/da-dialog.js');
  }

  renderDialog({ title, message, action, onClose }, content) {
    return html`
      <da-dialog title=${title} .message=${message} .action=${action} @close=${onClose}>
        ${content}
      </da-dialog>
    `;
  }

  renderYesInput() {
    return html`
      <sl-input
        type="text"
        placeholder="YES"
        autofocus=""
        @input=${this.upperCaseConfirm}
        aria-label="Type YES to confirm"
        value=${this._confirmText ?? ''}></sl-input>
    `;
  }

  renderUnpublishToggle() {
    return html`
      <div class="da-modal-checkbox">
        <input
          type="checkbox"
          name="confirm-unpublish"
          ?checked=${this._unpublish}
          @click=${() => { this._unpublish = !this._unpublish; }}>
        <label
          for="confirm-unpublish"
          @click=${() => { this._unpublish = !this._unpublish; }}>
          Unpublish ${this._itemString}
        </label>
      </div>
    `;
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
      this._filter = '';
      this._showFilter = undefined;
      this._allPagesLoaded = false;
      // Resolve the delete allowlist alongside the listing so the action bar's
      // Delete button is decided before any selection can surface it. The site
      // config is already warm (da-browse fetches it first) so this is cheap.
      const [items] = await Promise.all([this.getList(), this.updateDeletePermission()]);
      this._listItems = items;
    }

    if (props.has('newItem') && this.newItem) {
      this.handleNewItem();
    }

    super.update(props);
  }

  handleItemChecked(e, item, index) {
    if (e.detail.shiftKey && this._lastCheckedIndex !== null) {
      const start = Math.min(this._lastCheckedIndex, index);
      const end = Math.max(this._lastCheckedIndex, index);

      for (let i = start; i <= end; i += 1) {
        this._listItems[i].isChecked = e.detail.checked;
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

  handleSort(type, prop) {
    const first = type === 'old' ? -1 : 1;
    const last = type === 'old' ? 1 : -1;

    const sortFn = this.getSortFn(first, last, prop);
    this._listItems.sort(sortFn);
    this.applyFavoriteOrder();
    this.requestUpdate();
  }

  async handleNameSort() {
    this._sortDate = undefined;
    this._sortName = this._sortName === 'old' ? 'new' : 'old';
    await this.ensureAllPagesLoadedForSort();
    this.handleSort(this._sortName, 'name');
  }

  async handleDateSort() {
    this._sortName = undefined;
    this._sortDate = this._sortDate === 'old' ? 'new' : 'old';
    await this.ensureAllPagesLoadedForSort();
    this.handleSort(this._sortDate, 'lastModified');
  }

  async toggleFilterView() {
    this._filter = '';
    this._filterLoading = true;
    this._showFilter = !this._showFilter;
    const filterInput = this.shadowRoot?.querySelector('input[name="filter"]');
    filterInput.value = '';
    if (this._showFilter) {
      await this.loadAllPagesBulk();
      await this.wait(1);
      filterInput.focus();
      this._filterLoading = false;
    } else {
      this._filterLoading = false;
    }
  }

  handleFilterBlur(e) {
    if (e.target.value === '') {
      this._showFilter = false;
    }
  }

  handleNameFilter(e) {
    this._sortName = undefined;
    this._sortDate = undefined;
    this._filter = e.target.value;
  }

  get filteredItems() {
    return this._filter
      ? this._listItems.filter((item) => item.name.includes(this._filter))
      : this._listItems;
  }

  renderList(items) {
    const showSentinel = this._continuationToken && !this._allPagesLoaded;
    return html`
      <div class="da-item-list" role="presentation">
      ${repeat(items, (item) => item.path, (item, idx) => html`
        <da-list-item
          role="row"
          @checked=${(e) => this.handleItemChecked(e, item, idx)}
          @onstatus=${({ detail }) => this.setStatus(detail.text, detail.description, detail.type)}
          @renamecompleted=${(e) => this.handleRenameCompleted(e)}
          allowselect="${this.select ? true : nothing}"
          ischecked="${item.isChecked ? true : nothing}"
          isfavorited="${item.isFavorited ? true : nothing}"
          rename="${item.rename ? true : nothing}"
          name="${item.name}"
          path="${item.path}"
          date="${item.lastModified}"
          ext="${item.ext}"
          editor="${this.editor}"
          idx=${idx}>
        </da-list-item>`)}
        ${showSentinel ? html`<div class="da-list-sentinel" aria-hidden="true"></div>` : nothing}
      </div>
    `;
  }

  renderCheckBox() {
    return html`
      <label class="nx-checkbox ${this._bulkLoading ? 'loading' : ''} ${this._selectedItems.length > 0 && !this.isSelectAll ? 'indeterminate' : ''}" role="columnheader">
        <input type="checkbox" id="select-all" name="select-all" .checked="${this.isSelectAll}" @click="${this.handleCheckAll}" aria-label="Select all items" ?disabled=${this._bulkLoading} aria-disabled=${this._bulkLoading ? 'true' : 'false'}>
      </label>
    `;
  }

  getSortAttr(sortType) {
    if (!sortType) return 'none';
    return sortType === 'old' ? 'descending' : 'ascending';
  }

  render() {
    const hasMorePages = this._continuationToken && !this._allPagesLoaded;
    const { filteredItems } = this;
    const showList = filteredItems?.length > 0 || hasMorePages;

    return html`
      <div class="da-browse-panel-header" role="row">
        ${this.renderCheckBox()}
        <div class="da-browse-sort" role="presentation">
          <!-- Toggle button is split into 2 buttons (enable/disable) to prevent bug re-toggling on blur event -->
          <div role="columnheader" class="da-browse-sort-filter-container">
            ${!this._showFilter ? html`
              <button
                class="da-browse-filter ${this._filterLoading ? 'loading' : ''}"
                name="toggle-filter"
                @click=${() => this.toggleFilterView()}
                ?disabled=${this._filterLoading}
                aria-disabled=${this._filterLoading ? 'true' : 'false'}
                aria-label="Toggle filter">
                <svg viewBox="0 0 20 20"><use href="/img/icons/s2-icon-filter-20-n.svg#icon"></svg>
              </button>
            ` : html`
              <button
                class="da-browse-filter selected ${this._filterLoading ? 'loading' : ''}"
                name="toggle-filter"
                @click=${() => this.toggleFilterView()}
                ?disabled=${this._filterLoading}
                aria-disabled=${this._filterLoading ? 'true' : 'false'}
                aria-label="Toggle filter">
                <svg viewBox="0 0 20 20"><use href="/img/icons/s2-icon-filter-20-n.svg#icon"></svg>
              </button>
            `}
          </div>
          <div class="da-browse-header-container" role="columnheader" aria-sort="${this.getSortAttr(this._sortName) || 'none'}">
            <input @blur=${this.handleFilterBlur} name="filter" class=${this._showFilter ? 'show' : nothing} @change=${this.handleNameFilter} @keyup=${this.handleNameFilter} type="text" placeholder="Filter" aria-label="Filter items">
            <button
              class="da-browse-header-name ${this._sortName} ${this._showFilter ? 'hide' : ''} ${this._bulkLoading ? 'loading' : ''}"
              @click=${this.handleNameSort}
              ?disabled=${this._bulkLoading}
              aria-disabled=${this._bulkLoading ? 'true' : 'false'}>
              Name
            </button>
          </div>
          <div class="da-browse-header-container" role="columnheader" aria-sort="${this.getSortAttr(this._sortDate) || 'none'}">
            <button
              class="da-browse-header-name ${this._sortDate} ${this._bulkLoading ? 'loading' : ''}"
              @click=${this.handleDateSort}
              ?disabled=${this._bulkLoading}
              aria-disabled=${this._bulkLoading ? 'true' : 'false'}>
              Modified
            </button>
          </div>
        </div>
      </div>
      <div class="da-browse-panel" role="rowgroup" aria-label="File list" @dragenter=${this.drag ? this.dragenter : nothing} @dragleave=${this.drag ? this.dragleave : nothing}>
        ${showList ? this.renderList(filteredItems) : this.renderEmpty()}
        ${this.drag ? this.renderDropArea() : nothing}
      </div>
      <da-actionbar
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
      `;
  }
}

customElements.define('da-list', DaList);
