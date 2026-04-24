import { LitElement, html, repeat, nothing } from 'da-lit';
import { DA_ORIGIN } from '../../shared/constants.js';
import { getNx, sanitizePathParts } from '../../../scripts/utils.js';
import { daFetch, aemAdmin } from '../../shared/utils.js';
import { I18nController, t } from '../../shared/i18n.js';

import '../da-list-item/da-list-item.js';

// Styles & Icons
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const { default: getSvg } = await import(`${getNx()}/utils/svg.js`);
const STYLE = await getStyle(import.meta.url);
const ICONS = [
  '/blocks/edit/img/Smock_Cancel_18_N.svg',
  '/blocks/edit/img/Smock_Checkmark_18_N.svg',
  '/blocks/edit/img/Smock_Refresh_18_N.svg',
];

export default class DaList extends LitElement {
  static properties = {
    listtype: { type: String },
    fullpath: { type: String },
    editor: { type: String },
    select: { type: Boolean },
    sort: { type: Boolean },
    drag: { type: Boolean },
    listItems: { attribute: false },
    newItem: { attribute: false },
    _permissions: { state: true },
    _listItems: { state: true },
    _itemsRemaining: { state: true },
    _itemErrors: { state: true },
    _filter: { state: true },
    _showFilter: { state: true },
    _selectedItems: { state: true },
    _dropFiles: { state: true },
    _dropMessage: { state: true },
    _dropConflicts: { state: true },
    _status: { state: true },
    _confirm: { state: true },
    _confirmText: { state: true },
    _unpublish: { state: true },
    _continuationToken: { state: true },
    _isLoadingMore: { state: true },
    _bulkLoading: { state: true },
    _filterLoading: { state: true },
    _allPagesLoaded: { state: true },
  };

  // eslint-disable-next-line no-unused-private-class-members
  #i18n = new I18nController(this);

  constructor() {
    super();
    this._itemsRemaining = 0;
    this._itemErrors = [];
    this._dropFiles = [];
    this._emptyKey = 'browse.list.empty';
    this._dropKey = 'browse.list.drop';
    this._lastCheckedIndex = null;
    this._filter = '';
    this._continuationToken = null;
    this._isLoadingMore = false;
    this._observer = null;
    this._autoCheckTimer = null;
    this._listItemPaths = new Set();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [STYLE];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  async update(props) {
    if (props.has('listItems') && this.listItems) {
      this._listItems = this.listItems;
      this.resetListItemPaths(this._listItems);
    }

    if (props.has('fullpath') && this.fullpath) {
      this._filter = '';
      this._showFilter = undefined;
      this._allPagesLoaded = false;
      this._listItems = await this.getList();
    }

    if (props.has('newItem') && this.newItem) {
      this.handleNewItem();
    }

    super.update(props);
  }

  async firstUpdated() {
    await import('../../shared/da-dialog/da-dialog.js');
    await import('../da-actionbar/da-actionbar.js');
    this.setupObserver();
  }

  setStatus(text, description, type = 'info') {
    if (!text) {
      this._status = null;
      return;
    }
    this._status = { type, text, description };
  }

  handlePermissions(permissions) {
    this._permissions = permissions;

    // Notify parent
    const opts = { detail: permissions, bubbles: true, composed: true };
    const event = new CustomEvent('onpermissions', opts);
    this.dispatchEvent(event);
  }

  async getList() {
    try {
      this._continuationToken = null;
      const resp = await daFetch(`${DA_ORIGIN}/list${this.fullpath}`);
      if (resp.permissions) this.handlePermissions(resp.permissions);
      const json = await resp.json();
      const items = Array.isArray(json) ? json : json?.items || [];
      this._continuationToken = resp.headers?.get('da-continuation-token') || json?.continuationToken || null;
      this._allPagesLoaded = !this._continuationToken;
      this.resetListItemPaths(items);
      this.scheduleAutoCheck();
      return items;
    } catch {
      this._emptyKey = 'browse.list.notPermitted';
      this.resetListItemPaths([]);
      return [];
    }
  }

  async loadMore() {
    if (this._isLoadingMore || !this._continuationToken || this._allPagesLoaded) {
      return { added: 0, token: this._continuationToken || null };
    }
    const requestToken = this._continuationToken;
    this._isLoadingMore = true;
    try {
      const resp = await daFetch(`${DA_ORIGIN}/list${this.fullpath}`, { headers: { 'da-continuation-token': requestToken } });
      if (resp.permissions) this.handlePermissions(resp.permissions);
      const json = await resp.json();
      const nextItems = Array.isArray(json) ? json : json?.items || [];
      const existingItems = this._listItems || [];
      if (existingItems.length && this._listItemPaths.size === 0) {
        this.resetListItemPaths(existingItems);
      }
      const mergedItems = this.mergeUniqueItemsByPath(
        existingItems,
        nextItems,
        this._listItemPaths,
      );
      const uniqueAdded = mergedItems.length - existingItems.length;
      if (uniqueAdded) this._listItems = mergedItems;
      const nextToken = resp.headers?.get('da-continuation-token') || json?.continuationToken || null;

      if (!nextToken) {
        this._continuationToken = null;
        this._allPagesLoaded = true;
      } else {
        this._continuationToken = nextToken;
        this._allPagesLoaded = false;
      }

      if (!this._bulkLoading && !this._allPagesLoaded) this.scheduleAutoCheck();
      return { added: uniqueAdded, token: this._continuationToken };
    } catch {
      // ignore load-more errors for now
    } finally {
      this._isLoadingMore = false;
    }
    return { added: 0, token: null };
  }

  resetListItemPaths(items = []) {
    this._listItemPaths = new Set(items.map((item) => item?.path).filter(Boolean));
  }

  mergeUniqueItemsByPath(existingItems = [], incomingItems = [], pathIndex = null) {
    const seen = pathIndex || new Set(existingItems.map((item) => item?.path).filter(Boolean));
    const merged = [...existingItems];
    incomingItems.forEach((item) => {
      const key = item?.path;
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(item);
    });
    return merged;
  }

  handleNewItem() {
    // Add it to internal list
    if (this.newItem?.path) this._listItemPaths.add(this.newItem.path);
    this._listItems.unshift(this.newItem);
    // Clear the public item
    this.newItem = null;
  }

  handleClear() {
    this._listItems = this._listItems.map((item) => ({ ...item, isChecked: false, rename: false }));
    this._selectedItems = [];
    this._lastCheckedIndex = null;

    // Clear all dialog properties
    this.handleConfirmClose();

    // Clear all actionbar properties
    if (this.actionBar) this.actionBar.items = [];
  }

  handleErrorClose() {
    this._itemErrors = [];
  }

  handleConfirmClose() {
    this._confirm = null;
    this._confirmText = null;
    this._unpublish = null;
  }

  handleSelectionState() {
    this._selectedItems = this._listItems.filter((item) => item.isChecked);
    // If more than one item is selected, force everything to not be in a rename state
    if (this._selectedItems.length > 1) {
      this._listItems.forEach((item) => { item.rename = false; });
    }

    this.actionBar.items = this._selectedItems;
    this.requestUpdate();
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

  handleRename() {
    const item = this._listItems.find((lItem) => lItem.isChecked);
    item.rename = true;
    this.requestUpdate();
  }

  handleRenameCompleted(e) {
    const { oldPath, path, name, date } = e.detail;
    const index = this._listItems.findIndex((lItem) => lItem.path === oldPath);
    if (index < 0) return;

    const item = this._listItems[index];

    item.path = path;
    item.name = name;
    item.lastModified = date;

    this._listItemPaths.delete(oldPath);
    if (path) this._listItemPaths.add(path);
    this._listItems[index] = item;
  }

  wait(milliseconds) {
    return new Promise((r) => {
      setTimeout(r, milliseconds);
    });
  }

  async handleItemAction({ item, type = 'copy' }) {
    let continuationToken;

    const type2api = {
      copy: { api: 'copy', method: 'POST' },
      delete: { api: 'source', method: 'DELETE' },
      move: { api: 'move', method: 'POST' },
    };

    const { api, method } = type2api[type];

    // If source and dest are in the trash it's a proper move within the trash.
    const moveToTrash = api === 'move' && !item.path.includes('/.trash/') && item.destination.includes('/.trash/');

    try {
      do {
        let body;

        if (type !== 'delete') {
          body = new FormData();
          body.append('destination', item.destination);
          if (continuationToken) body.append('continuation-token', continuationToken);
        }

        const opts = { method, body };
        const resp = await daFetch(`${DA_ORIGIN}/${api}${item.path}`, opts);
        if (resp.status === 204) {
          break;
        }
        if (!resp.ok) {
          const err = new Error(`Unexpected status: ${resp.status}`);
          err.status = resp.status;
          throw err;
        }
        const json = await resp.json();
        continuationToken = json?.continuationToken;
      } while (continuationToken);

      item.isChecked = false;

      // Remove or add the item to the current list
      if (moveToTrash || method === 'DELETE') {
        this._listItems = this._listItems.filter((liItem) => liItem.path !== item.path);
        this._listItemPaths.delete(item.path);
      } else {
        const updatedItem = { ...item, path: item.destination, isChecked: false };
        if (!this._listItemPaths.has(updatedItem.path)) {
          this._listItemPaths.add(updatedItem.path);
          this._listItems = [updatedItem, ...this._listItems];
        }
      }
    } catch (e) {
      // The assumption here is that the user does not have permission to write to the trash
      if (moveToTrash && e.status === 403) {
        await this.handleItemAction({ item, type: 'delete' });
      } else {
        this._itemErrors.push({ ...item, message: t(`browse.list.errors.item.${type}`) });
      }
    }
  }

  async handlePaste(e) {
    // Format the destination items
    const itemsToPaste = this._selectedItems.map((item) => {
      const prefix = item.path.split('/').slice(0, -1).join('/');

      let pasteItem = {
        ...item,
        destination: item.path.replace(prefix, this.fullpath),
      };

      let existing;
      do {
        const { destination } = pasteItem;
        existing = this._listItems.find(({ path }) => path === destination);
        if (existing) {
          const name = `${existing.name}-copy`;
          const dest = item.ext ? `${this.fullpath}/${name}.${item.ext}` : `${existing.path}-copy`;
          pasteItem = { ...item, name, destination: dest };
        }
      } while (existing);

      return pasteItem;
    });

    const showStatus = setTimeout(() => {
      this.setStatus(t('browse.list.pasting'), t('browse.list.pasting.description'));
    }, 2000);

    const type = e.detail?.move ? 'move' : 'copy';

    await Promise.all(itemsToPaste.map(async (item) => {
      await this.handleItemAction({ item, type });
    }));

    clearTimeout(showStatus);

    this.setStatus();
    this.handleClear();
  }

  async handleDelete() {
    this._confirm = 'delete';
  }

  async handleConfirmDelete() {
    const { Queue } = await import(`${getNx()}/public/utils/tree.js`);

    const throttle = this._unpublish ? 250 : 0;

    this._itemsRemaining = this._selectedItems.length;

    const callback = async (item) => {
      const [org, site, ...rest] = sanitizePathParts(item.path);

      // If already in trash or not in a site, its a direct delete
      const directDelete = item.path.includes('/.trash/') || rest.length === 0;
      const type = directDelete ? 'delete' : 'move';
      if (!directDelete) {
        rest.pop();

        const date = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
        const datename = `${item.name}-${date}${item.ext ? `.${item.ext}` : ''}`;
        item.destination = `/${org}/${site}/.trash/${rest.length > 0 ? `${rest.join('/')}/` : ''}${datename}`;
      }

      await this.handleItemAction({ item, type });

      if (this._unpublish && this._confirmText === 'YES') {
        const previewJson = await aemAdmin(item.path, 'preview', 'DELETE');
        if (!previewJson) this._itemErrors.push({ ...item, message: t('browse.list.errors.unpublishPreview') });

        const liveJson = await aemAdmin(item.path, 'live', 'DELETE');
        if (!liveJson) this._itemErrors.push({ ...item, message: t('browse.list.errors.unpublishProd') });
      }
      this._itemsRemaining -= 1;

      // Done in the loop to prevent CTA flickering
      if (this._itemsRemaining === 0) {
        this.handleClear();
      }
    };

    const queue = new Queue(callback, 5, null, throttle);

    await Promise.all(this._selectedItems.map((item) => queue.push(item)));
  }

  handleShare() {
    this.setStatus(t('browse.list.copied.title'), t('browse.list.copied.urls'));
    setTimeout(() => { this.setStatus(); }, 3000);
  }

  dragenter(e) {
    e.stopPropagation();
    e.target.closest('.da-browse-panel').classList.add('is-dragged-over');
    e.preventDefault();
  }

  dragleave(e) {
    if (!e.target.classList.contains('da-drop-area')) return;
    e.target.closest('.da-browse-panel').classList.remove('is-dragged-over');
    e.preventDefault();
  }

  dragover(e) {
    e.preventDefault();
  }

  setDropMessage() {
    const { length } = this._dropFiles.filter((file) => !file.imported);
    if (length === 0) {
      this._dropKey = 'browse.list.drop';
      this._dropCount = 0;
      this.requestUpdate();
      return;
    }
    this._dropKey = 'browse.list.importing';
    this._dropCount = length;
    this.requestUpdate();
  }

  async drop(e) {
    e.preventDefault();
    const items = e.dataTransfer?.items;
    if (!items) {
      this.shadowRoot.querySelector('.da-browse-panel').classList.remove('is-dragged-over');
      return;
    }

    const entries = [...items].map((item) => item.webkitGetAsEntry()).filter((x) => x);
    if (!entries.length) {
      this.shadowRoot.querySelector('.da-browse-panel').classList.remove('is-dragged-over');
      return;
    }

    const { getFullEntryList, getDropConflicts } = await import('./helpers/utils.js');
    this._dropFiles = await getFullEntryList(entries);

    const conflicts = getDropConflicts(this._listItems, this._dropFiles);
    if (conflicts.length) {
      this._dropConflicts = conflicts;
      return;
    }

    await this.processDropFiles();
  }

  async processDropFiles() {
    const makeBatches = (await import(`${getNx()}/utils/batch.js`)).default;
    const { handleUpload } = await import('./helpers/utils.js');

    this.setDropMessage();

    const batches = makeBatches(this._dropFiles);
    for (const batch of batches) {
      await Promise.all(batch.map(async (file) => {
        const item = await handleUpload(this._listItems, this.fullpath, file);
        this.setDropMessage();
        if (item) {
          if (item.path) this._listItemPaths.add(item.path);
          this._listItems.unshift(item);
        }
        this.requestUpdate();
      }));
    }
    this._dropFiles = [];
    this.setDropMessage();
    this.shadowRoot.querySelector('.da-browse-panel').classList.remove('is-dragged-over');
  }

  async handleDropConfirm() {
    this._dropConflicts = null;
    await this.processDropFiles();
  }

  handleDropCancel() {
    this._dropConflicts = null;
    this._dropFiles = [];
    this.setDropMessage();
    this.shadowRoot.querySelector('.da-browse-panel').classList.remove('is-dragged-over');
  }

  async handleCheckAll() {
    const check = !this.isSelectAll;

    if (check && this._continuationToken && !this._allPagesLoaded) {
      this._bulkLoading = true;
      try {
        await this.loadAllPages();
      } finally {
        this._bulkLoading = false;
      }
    }

    this._listItems.forEach((item) => { item.isChecked = check; });
    this.handleSelectionState();
  }

  getSortFn(first, last, prop) {
    return (a, b) => {
      if (prop === 'lastModified') {
        if (!a[prop]) a[prop] = '';
        if (!b[prop]) b[prop] = '';
      }
      if (a[prop] > b[prop]) return first;
      if (a[prop] < b[prop]) return last;
      return 0;
    };
  }

  handleSort(type, prop) {
    const first = type === 'old' ? -1 : 1;
    const last = type === 'old' ? 1 : -1;

    const sortFn = this.getSortFn(first, last, prop);
    this._listItems.sort(sortFn);
    this.requestUpdate();
  }

  async ensureAllPagesLoadedForSort() {
    if (!this._continuationToken || this._allPagesLoaded) return;
    this._forceLoadAll = true;
    this._bulkLoading = true;
    try {
      await this.loadAllPages();
    } finally {
      this._bulkLoading = false;
      this._forceLoadAll = false;
    }
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
      if (this._continuationToken && !this._allPagesLoaded) {
        this._bulkLoading = true;
        await this.loadAllPages();
        this._bulkLoading = false;
      }
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

  get isSelectAll() {
    const selectCount = this._listItems.filter((item) => item.isChecked).length;
    return selectCount === this._listItems.length && this._listItems.length !== 0;
  }

  get actionBar() {
    return this.shadowRoot?.querySelector('da-actionbar');
  }

  get _confirmContent() {
    const noUnpub = this._selectedItems.some((item) => !item.ext || item.ext === 'link' || item.path.includes('/.trash/'));
    const inTrash = this._selectedItems.some((item) => item.path.includes('/.trash/'));
    const linkOnly = this._selectedItems.length === 1 && this._selectedItems[0].ext === 'link';

    if (noUnpub) {
      return html`<p>${t('browse.list.delete.are.you.sure')}${inTrash || linkOnly ? '' : ` ${t('browse.list.delete.suffix.remain')}`}</p>`;
    }

    const checkbox = html`
      <div class="da-modal-checkbox">
        <input
          type="checkbox"
          name="confirm-unpublish"
          ?checked=${this._unpublish}
          @click=${() => { this._unpublish = !this._unpublish; }}>
        <label
          for="confirm-unpublish"
          @click=${() => { this._unpublish = !this._unpublish; }}>
          ${t('browse.list.delete.unpublish')}
        </label>
      </div>
    `;

    // If checkbox checked, only return the checkbox
    if (!this._unpublish) return checkbox;

    // Return checkbox and confirm text
    return html`
      ${checkbox}
      <div class="da-actionbar-modal-confirmation">
        <p class="sl-heading-m">${t('browse.list.delete.unpublishConfirmHeading')}</p>
        <p>${t('browse.list.delete.typeYesConfirm', { yes: 'YES' })}</p>
        <sl-input
          type="text"
          placeholder="YES"
          autofocus=""
          @input=${({ target }) => { this._confirmText = target.value; }}
          aria-label=${t('browse.list.delete.unpublishTypeAria')}
          value=${this._confirmText}></sl-input>
      </div>
    `;
  }

  renderEmpty() {
    return html`<div class="empty-list"><h3>${t(this._emptyKey)}</h3></div>`;
  }

  renderStatus() {
    return html`
      <div class="da-list-status">
        <div class="da-list-status-toast da-list-status-type-${this._status.type}">
          <p class="da-list-status-title">${this._status.text}</p>
          ${this._status.description ? html`<p class="da-list-status-description">${this._status.description}</p>` : nothing}
        </div>
      </div>`;
  }

  renderConfirm() {
    const title = t('browse.list.delete.deleting', { count: this._selectedItems.length });
    const hasRemaining = this._itemsRemaining !== 0;
    const message = hasRemaining ? t('browse.list.delete.remaining', { count: this._itemsRemaining }) : nothing;
    const unpublishConfirmed = this._unpublish && this._confirmText !== 'YES';

    const action = {
      style: 'negative',
      label: this._unpublish ? t('browse.list.delete.unpublishAndDelete') : t('common.delete'),
      click: async () => this.handleConfirmDelete(),
      disabled: unpublishConfirmed || hasRemaining,
    };

    return html`
      <da-dialog
        title=${title}
        .message=${message}
        .action=${action}
        @close=${this.handleConfirmClose}>
        ${this._confirmContent}
      </da-dialog>
    `;
  }

  renderDropConfirm() {
    const count = this._dropConflicts.length;

    const action = {
      style: 'negative',
      label: t('browse.list.drop.replace'),
      click: async () => this.handleDropConfirm(),
    };

    return html`
      <da-dialog
        title=${t('browse.list.drop.replaceTitle', { count })}
        .action=${action}
        @close=${this.handleDropCancel}>
        <p>${t('browse.list.drop.replaceBody', { count })}</p>
        <ul class="da-drop-conflicts">
          ${this._dropConflicts.map((name) => html`<li>${name}</li>`)}
        </ul>
      </da-dialog>
    `;
  }

  renderErrors() {
    const action = {
      style: 'accent',
      label: t('browse.list.errors.copy'),
      click: async () => {
        const { items2Clipboard } = await import('./helpers/utils.js');
        items2Clipboard(this._itemErrors);
      },
    };

    return html`
      <da-dialog
        title=${t('browse.list.errors.title')}
        .action=${action}
        @close=${this.handleErrorClose}>
        ${this._itemErrors.map((item) => html`
          <p class="error-item-message">${item.message}</p>
          <p class="error-item-name">${item.name}</p>
        `)}
      </da-dialog>
    `;
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

  renderDropArea() {
    const dropMessage = this._dropCount
      ? t(this._dropKey, { count: this._dropCount })
      : t(this._dropKey);
    return html`
      <div class="da-drop-area" data-message=${dropMessage} @dragover=${this.dragover} @drop=${this.drop}></div>`;
  }

  renderCheckBox() {
    return html`
      <div class="checkbox-wrapper ${this._bulkLoading ? 'loading' : ''}" role="columnheader">
        <input type="checkbox" id="select-all" name="select-all" .checked="${this.isSelectAll}" @click="${this.handleCheckAll}" aria-label=${t('browse.list.selectAll')} ?disabled=${this._bulkLoading} aria-disabled=${this._bulkLoading ? 'true' : 'false'}>
        <label class="checkbox-label" for="select-all"></label>
      </div>
      <input type="checkbox" name="select" style="display: none;">
    `;
  }

  getSortAttr(sortType) {
    if (!sortType) return 'none';
    return sortType === 'old' ? 'descending' : 'ascending';
  }

  render() {
    const hasMorePages = this._continuationToken && !this._allPagesLoaded;
    const filteredItems = this._filter
      ? this._listItems.filter((item) => item.name.includes(this._filter))
      : this._listItems;
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
                aria-label=${t('browse.list.filter.toggle')}>
                <img class="toggle-icon-dark" width="20" src="/blocks/browse/da-browse/img/Filter20.svg" alt="" />
              </button>
            ` : html`
              <button
                class="da-browse-filter selected ${this._filterLoading ? 'loading' : ''}"
                name="toggle-filter"
                @click=${() => this.toggleFilterView()}
                ?disabled=${this._filterLoading}
                aria-disabled=${this._filterLoading ? 'true' : 'false'}
                aria-label=${t('browse.list.filter.toggle')}>
                <img class="toggle-icon-dark" width="20" src="/blocks/browse/da-browse/img/Filter20.svg" alt="" />
              </button>
            `}
          </div>
          <div class="da-browse-header-container" role="columnheader" aria-sort="${this.getSortAttr(this._sortName) || 'none'}">
            <input @blur=${this.handleFilterBlur} name="filter" class=${this._showFilter ? 'show' : nothing} @change=${this.handleNameFilter} @keyup=${this.handleNameFilter} type="text" placeholder=${t('browse.list.filter.placeholder')} aria-label=${t('browse.list.filter.aria')}>
            <button
              class="da-browse-header-name ${this._sortName} ${this._showFilter ? 'hide' : ''} ${this._bulkLoading ? 'loading' : ''}"
              @click=${this.handleNameSort}
              ?disabled=${this._bulkLoading}
              aria-disabled=${this._bulkLoading ? 'true' : 'false'}>
              ${t('browse.list.sort.name')}
            </button>
          </div>
          <div class="da-browse-header-container" role="columnheader" aria-sort="${this.getSortAttr(this._sortDate) || 'none'}">
            <button
              class="da-browse-header-name ${this._sortDate} ${this._bulkLoading ? 'loading' : ''}"
              @click=${this.handleDateSort}
              ?disabled=${this._bulkLoading}
              aria-disabled=${this._bulkLoading ? 'true' : 'false'}>
              ${t('browse.list.sort.modified')}
            </button>
          </div>
        </div>
      </div>
      <div class="da-browse-panel" role="rowgroup" aria-label=${t('browse.list.fileList.aria')} @dragenter=${this.drag ? this.dragenter : nothing} @dragleave=${this.drag ? this.dragleave : nothing}>
        ${showList ? this.renderList(filteredItems) : this.renderEmpty()}
        ${this.drag ? this.renderDropArea() : nothing}
      </div>
      <da-actionbar
        .permissions=${this._permissions}
        @clearselection=${this.handleClear}
        @rename=${this.handleRename}
        @onpaste=${this.handlePaste}
        @ondelete=${this.handleDelete}
        @onshare=${this.handleShare}
        currentPath="${this.fullpath}"
        role="row"
        data-visible="${this._selectedItems?.length > 0}"></da-actionbar>
      ${this._status ? this.renderStatus() : nothing}
      ${this._confirm ? this.renderConfirm() : nothing}
      ${this._dropConflicts?.length ? this.renderDropConfirm() : nothing}
      ${!this._confirm && this._itemErrors.length ? this.renderErrors() : nothing}
      `;
  }

  setupObserver() {
    if (this._observer) return;
    this._observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) this.loadMore();
      });
    }, { root: null, rootMargin: '200px' });
  }

  hasPaginationStateChanges(changedProps = new Map()) {
    if (
      changedProps.has('fullpath')
      || changedProps.has('_continuationToken')
      || changedProps.has('_allPagesLoaded')
      || changedProps.has('_bulkLoading')
      || changedProps.has('_isLoadingMore')
    ) {
      return true;
    }

    if (!changedProps.has('_listItems')) return false;
    const previousItems = changedProps.get('_listItems');
    const previousLength = Array.isArray(previousItems) ? previousItems.length : 0;
    const nextLength = Array.isArray(this._listItems) ? this._listItems.length : 0;
    return previousLength !== nextLength;
  }

  updated(changedProps) {
    super.updated(changedProps);
    if (!this._observer) this.setupObserver();
    const sentinel = this.shadowRoot?.querySelector('.da-list-sentinel');
    if (this._observer) {
      this._observer.disconnect();
      if (sentinel) this._observer.observe(sentinel);
    }
    if (this.hasPaginationStateChanges(changedProps)) this.scheduleAutoCheck();
  }

  checkLoadMore() {
    if (this._bulkLoading) return;
    if (this._allPagesLoaded) return;
    if (!this._continuationToken) return;
    const sentinel = this.shadowRoot?.querySelector('.da-list-sentinel');
    if (!sentinel) return;
    const panel = this.shadowRoot?.querySelector('.da-browse-panel');
    if (!panel) return;

    const rootRect = panel.getBoundingClientRect();
    const rect = sentinel.getBoundingClientRect();

    const rootHeight = rootRect.bottom - rootRect.top;
    const threshold = rootHeight * 2;
    if (this._forceLoadAll || rect.top <= rootRect.bottom + threshold) {
      this.loadMore();
    }
  }

  scheduleAutoCheck() {
    if (this._bulkLoading) return;
    if (this._allPagesLoaded) return;
    if (!this._continuationToken) return;
    if (this._autoCheckTimer) return;
    this._autoCheckTimer = setTimeout(() => {
      this._autoCheckTimer = null;
      this.checkLoadMore();
    }, 0);
  }

  disconnectedCallback() {
    if (this._observer) this._observer.disconnect();
    if (this._autoCheckTimer) clearTimeout(this._autoCheckTimer);
    super.disconnectedCallback();
  }

  async loadAllPages() {
    if (this._allPagesLoaded) return;
    let safety = 0;
    let stalledPages = 0;
    let previousToken = this._continuationToken;
    while (safety < 500 && !this._allPagesLoaded) {
      if (this._isLoadingMore) {
        // Wait for in-flight pagination requests before continuing.
        // eslint-disable-next-line no-await-in-loop
        await this.wait(25);
        safety += 1;
      } else {
        if (!this._continuationToken) break;
        // eslint-disable-next-line no-await-in-loop
        const { token, added } = await this.loadMore();
        if (!token) break;
        if (token === previousToken && added === 0) {
          stalledPages += 1;
        } else {
          stalledPages = 0;
        }
        if (stalledPages >= 2) break;
        previousToken = token;
        safety += 1;
      }
    }
  }
}

customElements.define('da-list', DaList);
