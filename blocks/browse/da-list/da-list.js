import { LitElement, html, repeat, nothing } from 'da-lit';
import { DA_ORIGIN } from '../../shared/constants.js';
import { getNx, sanitizePathParts } from '../../../scripts/utils.js';
import { daFetch, aemAdmin } from '../../shared/utils.js';

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
    _status: { state: true },
    _confirm: { state: true },
    _confirmText: { state: true },
    _unpublish: { state: true },
  };

  constructor() {
    super();
    this._itemsRemaining = 0;
    this._itemErrors = [];
    this._dropFiles = [];
    this._emptyMessage = 'Empty';
    this._dropMessage = 'Drop content here';
    this._lastCheckedIndex = null;
    this._filter = '';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [STYLE];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  async update(props) {
    if (props.has('listItems') && this.listItems) {
      this._listItems = this.listItems;
    }

    if (props.has('fullpath') && this.fullpath) {
      this._filter = '';
      this._showFilter = undefined;
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
    this.resumePendingJobs();
  }

  setStatus(text, description, type = 'info') {
    if (!text) {
      this._status = null;
    } else {
      this._status = { type, text, description };
    }
    this.requestUpdate();
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
      const resp = await daFetch(`${DA_ORIGIN}/list${this.fullpath}`);
      if (resp.permissions) this.handlePermissions(resp.permissions);
      const json = await resp.json();
      return json;
    } catch {
      this._emptyMessage = 'Not permitted';
      return [];
    }
  }

  handleNewItem() {
    // Add it to internal list
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

    this._listItems[index] = item;
  }

  wait(milliseconds) {
    return new Promise((r) => {
      setTimeout(r, milliseconds);
    });
  }

  /**
   * Performs the API call only; returns sync/async result for aggregated paste (Option A).
   * Used by handlePaste to collect all 202s, then poll in one loop.
   */
  async handleItemActionApi({ item, type = 'copy' }) {
    const type2api = {
      copy: { api: 'copy', method: 'POST' },
      delete: { api: 'source', method: 'DELETE' },
      move: { api: 'move', method: 'POST' },
    };

    const { api, method } = type2api[type];
    const moveToTrash = api === 'move' && !item.path.includes('/.trash/')
      && item.destination.includes('/.trash/');

    const copyUrl = `${DA_ORIGIN}/${api}${item.path}`;
    // eslint-disable-next-line no-console
    console.log('[da-list handleItemActionApi] start', { type, itemPath: item.path, url: copyUrl });

    let jobKey = this.findExistingJob(type, item);

    if (!jobKey) {
      let body;
      if (type !== 'delete') {
        body = new FormData();
        body.append('destination', item.destination);
      }

      const resp = await daFetch(copyUrl, { method, body });
      // eslint-disable-next-line no-console
      console.log('[da-list handleItemActionApi] response', { status: resp.status, type });

      if (resp.status === 204 || resp.status === 200) {
        let total = 1;
        try {
          const json = await resp.json();
          if (typeof json?.total === 'number') total = json.total;
        } catch { /* empty or invalid body */ }
        this.updateListAfterAction(item, type, moveToTrash);
        return { sync: true, total };
      }
      if (resp.status === 202) {
        const json = await resp.json();
        jobKey = `da-job-${json.jobId}`;
        localStorage.setItem(jobKey, JSON.stringify({
          jobId: json.jobId,
          total: json.total,
          type,
          path: item.path,
          destination: item.destination,
          name: item.name,
          ext: item.ext,
        }));
        return { sync: false, jobKey, jobId: json.jobId, total: json.total, item, type, moveToTrash };
      }
      let errorMessage = `Unexpected status ${resp.status}`;
      try {
        const body = await resp.json();
        if (body?.message) errorMessage = body.message;
        else if (body?.error) errorMessage = body.error;
      } catch { /* body not JSON or empty */ }
      this._itemErrors.push({ ...item, message: errorMessage });
      return { sync: true, error: true };
    }

    const stored = JSON.parse(localStorage.getItem(jobKey));
    return { sync: false, jobKey, jobId: stored.jobId, total: stored.total, item, type, moveToTrash };
  }

  async handleItemAction({ item, type = 'copy' }) {
    const result = await this.handleItemActionApi({ item, type });
    if (result.sync) return;

    const { jobKey, item: it, type: t, moveToTrash } = result;
    try {
      await this.pollJob(jobKey, it, t);
      this.updateListAfterAction(it, t, moveToTrash);
    } catch {
      if (moveToTrash) {
        await this.handleItemAction({ item: it, type: 'delete' });
      } else {
        this._itemErrors.push({ ...it, message: `Couldn't ${t} item` });
      }
    }
  }

  findExistingJob(type, item) {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith('da-job-')) continue;
      try {
        const stored = JSON.parse(localStorage.getItem(key));
        if (stored.type === type && stored.path === item.path
          && stored.destination === (item.destination || undefined)) return key;
      } catch { /* ignore */ }
    }
    return null;
  }

  /**
   * Polls multiple jobs in one loop, aggregating progress for Option A.
   * Shows "X of Y items" across all jobs (includes sync-completed when opts passed).
   */
  async pollAllJobs(asyncResults, opts = {}) {
    const POLL_INTERVAL = 1000;
    const labels = { copy: 'Copying', move: 'Moving' };
    const type = asyncResults[0]?.type || 'copy';
    const totalItems = opts.totalFiles ?? asyncResults.reduce((s, r) => s + r.total, 0);
    const initialCompleted = opts.initialCompleted ?? 0;
    const completedByJob = {};
    let remaining = [...asyncResults];

    this.setStatus(labels[type] || 'Processing', `${initialCompleted} of ${totalItems} items`);

    // eslint-disable-next-line no-console
    console.log('[da-list pollAllJobs] start', { count: asyncResults.length, totalItems, initialCompleted });

    while (remaining.length > 0) {
      const stillRunning = [];

      for (const r of remaining) {
        const [org] = r.item.path.slice(1).split('/');
        const jobUrl = `${DA_ORIGIN}/job/${org}/${r.jobId}`;
        try {
          const resp = await daFetch(jobUrl, { cache: 'no-store' });
          if (!resp.ok) throw new Error('Job status unavailable');
          const status = await resp.json();
          completedByJob[r.jobId] = status.completed ?? 0;

          // eslint-disable-next-line no-console
          console.log('[da-list pollAllJobs] job status', { jobId: r.jobId, url: jobUrl, completed: status.completed, total: status.total, state: status.state });

          if (status.state === 'complete') {
            localStorage.removeItem(r.jobKey);
            this.updateListAfterAction(r.item, r.type, r.moveToTrash);
          } else {
            stillRunning.push(r);
          }
        } catch {
          this._itemErrors.push({ ...r.item, message: `Couldn't ${r.type} item` });
          localStorage.removeItem(r.jobKey);
        }
      }

      const asyncCompleted = Object.values(completedByJob).reduce((a, b) => a + b, 0);
      const displayCompleted = initialCompleted + asyncCompleted;
      this.setStatus(
        labels[type] || 'Processing',
        `${displayCompleted} of ${totalItems} items`,
      );
      // eslint-disable-next-line no-console
      console.log('[da-list pollAllJobs] display', { displayCompleted, totalItems, initialCompleted, asyncCompleted, byJob: { ...completedByJob } });
      remaining = stillRunning;

      if (remaining.length > 0) {
        await new Promise((r) => { setTimeout(r, POLL_INTERVAL); });
      }
    }
  }

  async pollJob(jobKey, item, type) {
    const POLL_INTERVAL = 1000;
    const stored = JSON.parse(localStorage.getItem(jobKey));
    const { jobId, total } = stored;
    const [org] = item.path.slice(1).split('/');
    const jobUrl = `${DA_ORIGIN}/job/${org}/${jobId}`;
    const labels = { copy: 'Copying', move: 'Moving', delete: 'Deleting' };

    // eslint-disable-next-line no-console
    console.log('[da-list pollJob] start', { jobKey, jobId, total, itemPath: item.path, org, jobUrl });

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const resp = await daFetch(jobUrl, { cache: 'no-store' });
      // eslint-disable-next-line no-console
      console.log('[da-list pollJob] fetch', { ok: resp.ok, status: resp.status, url: jobUrl });
      if (!resp.ok) throw new Error('Job status unavailable');
      // eslint-disable-next-line no-await-in-loop
      const status = await resp.json();
      // eslint-disable-next-line no-console
      console.log('[da-list pollJob] status', { state: status.state, completed: status.completed, total: status.total, failed: status.failed, raw: status });

      this.setStatus(
        `${labels[type] || 'Processing'} ${item.name}`,
        `${status.completed} of ${total} items`,
      );

      if (status.state === 'complete') {
        // eslint-disable-next-line no-console
        console.log('[da-list pollJob] complete', { failed: status.failed });
        localStorage.removeItem(jobKey);
        if (status.failed > 0) {
          this.setStatus(
            `${labels[type] || 'Processed'} ${item.name}`,
            `Done with ${status.failed} error${status.failed > 1 ? 's' : ''}`,
            'warning',
          );
        } else {
          this.setStatus();
        }
        return;
      }

      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, POLL_INTERVAL); });
    }
  }

  updateListAfterAction(item, type, moveToTrash = false) {
    item.isChecked = false;
    if (moveToTrash || type === 'delete') {
      this._listItems = this._listItems.filter((li) => li.path !== item.path);
    } else {
      this._listItems = [
        { ...item, path: item.destination || item.path, isChecked: false },
        ...this._listItems,
      ];
    }
  }

  async resumePendingJobs() {
    const allKeys = Array.from(
      { length: localStorage.length },
      (_, i) => localStorage.key(i),
    ).filter((k) => k?.startsWith('da-job-'));

    for (const key of allKeys) {
      try {
        const stored = JSON.parse(localStorage.getItem(key));
        const resumeItem = {
          name: stored.name || 'previous operation',
          path: stored.path,
          destination: stored.destination,
          ext: stored.ext,
        };
        const resumeMoveToTrash = stored.type === 'move'
          && !stored.path?.includes('/.trash/')
          && stored.destination?.includes('/.trash/');
        this.pollJob(key, resumeItem, stored.type)
          .then(() => {
            this.updateListAfterAction(resumeItem, stored.type, resumeMoveToTrash);
            this.setStatus();
          })
          .catch(() => {
            localStorage.removeItem(key);
            this.setStatus();
          });
      } catch {
        localStorage.removeItem(key);
      }
    }
  }

  async handlePaste(e) {
    // eslint-disable-next-line no-console
    console.log('[da-list handlePaste] invoked', { move: e.detail?.move, selectedCount: this._selectedItems?.length });
    // Format the destination items
    const itemsToPaste = this._selectedItems.map((item) => {
      const prefix = item.path.split('/').slice(0, -1).join('/');

      let checkForExisting = true;
      let pasteItem = {
        ...item,
        destination: item.path.replace(prefix, this.fullpath),
      };

      while (checkForExisting) {
        const { destination } = pasteItem;
        const existing = this._listItems.find(({ path }) => path === destination);
        if (existing) {
          const name = `${existing.name}-copy`;
          const dest = item.ext ? `${this.fullpath}/${name}.${item.ext}` : `${existing.path}-copy`;
          pasteItem = { ...item, name, destination: dest };
        } else {
          checkForExisting = false;
        }
      }

      return pasteItem;
    });

    const showStatus = setTimeout(() => {
      this.setStatus('Pasting', 'Please be patient. Pasting items with many children can take time.');
    }, 2000);

    const type = e.detail?.move ? 'move' : 'copy';
    const labels = { copy: 'Copying', move: 'Moving' };

    // Prefetch file counts (including subfolders) via GET /count so we have correct total from the start
    let totalFiles = 0;
    const countPromises = itemsToPaste.map(async (item) => {
      try {
        const resp = await daFetch(`${DA_ORIGIN}/count${item.path}`, { cache: 'no-store' });
        if (resp.ok) {
          const json = await resp.json();
          return typeof json?.total === 'number' ? json.total : (item.ext ? 1 : 0);
        }
      } catch { /* ignore */ }
      return item.ext ? 1 : 0;
    });
    const counts = await Promise.all(countPromises);
    totalFiles = counts.reduce((s, c) => s + c, 0);
    if (totalFiles > 0) {
      clearTimeout(showStatus);
      this.setStatus(labels[type] || 'Pasting', `0 of ${totalFiles} items`);
    }

    // Option A: run all API calls in parallel, collect 202s, poll in one loop with aggregated progress
    let completedFiles = 0;
    let lastProgressTime = Date.now();
    const STALL_MS = 3000;
    const heartbeat = totalFiles > 0 ? setInterval(() => {
      if (Date.now() - lastProgressTime > STALL_MS) {
        this.setStatus(labels[type] || 'Pasting', `${completedFiles} of ${totalFiles} items (still working…)`);
      }
    }, 1000) : null;

    const results = await Promise.all(
      itemsToPaste.map(async (item) => {
        const result = await this.handleItemActionApi({ item, type });
        if (result.sync && !result.error) {
          completedFiles += result.total ?? 1;
        }
        lastProgressTime = Date.now();
        clearTimeout(showStatus);
        this.setStatus(labels[type] || 'Pasting', `${completedFiles} of ${totalFiles} items`);
        return result;
      }),
    );
    if (heartbeat) clearInterval(heartbeat);
    clearTimeout(showStatus);

    // Fallback if count API failed or returned 0
    if (totalFiles === 0) {
      totalFiles = results.reduce(
        (sum, r) => sum + (r.error ? 0 : (r.total ?? (r.sync ? 1 : 0))),
        0,
      );
    }

    const completedFromSync = results.reduce(
      (sum, r) => sum + (r.sync && !r.error ? (r.total ?? 1) : 0),
      0,
    );

    const asyncResults = results.filter((r) => !r.sync && !r.error);
    // eslint-disable-next-line no-console
    console.log('[da-list handlePaste] results', { total: results.length, async: asyncResults.length, sync: results.filter((r) => r.sync).length, totalFiles, completedFromSync });
    if (asyncResults.length > 0) {
      if (totalFiles > 0) {
        this.setStatus(labels[type] || 'Pasting', `${completedFromSync} of ${totalFiles} items`);
      }
      await this.pollAllJobs(asyncResults, { totalFiles, initialCompleted: completedFromSync });
    } else if (totalFiles > 0) {
      this.setStatus(labels[type] || 'Pasting', `${totalFiles} of ${totalFiles} items`);
    }

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
        const datename = `${item.name}--${date}${item.ext ? `.${item.ext}` : ''}`;
        item.destination = `/${org}/${site}/.trash/${rest.length > 0 ? `${rest.join('/')}/` : ''}${datename}`;
      }

      await this.handleItemAction({ item, type });

      if (this._unpublish && this._confirmText === 'YES') {
        const json = await aemAdmin(item.path, 'live', 'DELETE');
        if (!json) this._itemErrors.push({ ...item, message: 'Couldn\'t unpublish' });
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
    this.setStatus('Copied', 'URLs have been copied to the clipboard.');
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
      this._dropMessage = 'Drop content here';
      return;
    }
    const prefix = `Importing - ${length} `;
    const suffix = length === 1 ? 'item' : 'items';
    this._dropMessage = `${prefix} ${suffix}`;
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

    const makeBatches = (await import(`${getNx()}/utils/batch.js`)).default;
    const { getFullEntryList, handleUpload } = await import('./helpers/utils.js');
    this._dropFiles = await getFullEntryList(entries);

    this.setDropMessage();

    const batches = makeBatches(this._dropFiles);
    for (const batch of batches) {
      await Promise.all(batch.map(async (file) => {
        const item = await handleUpload(this._listItems, this.fullpath, file);
        this.setDropMessage();
        if (item) {
          this._listItems.unshift(item);
          this.requestUpdate();
        }
      }));
    }
    this._dropFiles = [];
    this.setDropMessage();
    this.shadowRoot.querySelector('.da-browse-panel').classList.remove('is-dragged-over');
  }

  handleCheckAll() {
    const check = !this.isSelectAll;
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

  handleNameSort() {
    this._sortDate = undefined;
    this._sortName = this._sortName === 'old' ? 'new' : 'old';
    this.handleSort(this._sortName, 'name');
  }

  handleDateSort() {
    this._sortName = undefined;
    this._sortDate = this._sortDate === 'old' ? 'new' : 'old';
    this.handleSort(this._sortDate, 'lastModified');
  }

  toggleFilterView() {
    this._filter = '';
    this._showFilter = !this._showFilter;
    const filterInput = this.shadowRoot?.querySelector('input[name="filter"]');
    filterInput.value = '';
    if (this._showFilter) {
      this.wait(1).then(() => { filterInput.focus(); });
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

  get _itemString() {
    return this._selectedItems.length > 1 ? 'items' : 'item';
  }

  get _confirmContent() {
    const noUnpub = this._selectedItems.some((item) => !item.ext || item.ext === 'link' || item.path.includes('/.trash/'));
    const inTrash = this._selectedItems.some((item) => item.path.includes('/.trash/'));
    const linkOnly = this._selectedItems.length === 1 && this._selectedItems[0].ext === 'link';

    if (noUnpub) {
      return html`<p>Are you sure you want to delete this content?${inTrash || linkOnly ? '' : ' Published items will remain live.'}</p>`;
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
          Unpublish ${this._itemString}
        </label>
      </div>
    `;

    // If checkbox checked, only return the checkbox
    if (!this._unpublish) return checkbox;

    // Return checkbox and confirm text
    return html`
      ${checkbox}
      <div class="da-actionbar-modal-confirmation">
        <p class="sl-heading-m">Are you sure you want to unpublish?</p>
        <p>Type <strong>YES</strong> to confirm.</p>
        <sl-input
          type="text"
          placeholder="YES"
          autofocus=""
          @input=${({ target }) => { this._confirmText = target.value; }}
          aria-label="Type yes to confirm unpublish"
          value=${this._confirmText}></sl-input>
      </div>
    `;
  }

  renderEmpty() {
    return html`<div class="empty-list"><h3>${this._emptyMessage}</h3></div>`;
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
    const title = `Deleting ${this._selectedItems.length} ${this._itemString}`;
    const hasRemaining = this._itemsRemaining !== 0;
    const message = hasRemaining ? `${this._itemsRemaining} remaining` : nothing;
    const unpublishConfirmed = this._unpublish && this._confirmText !== 'YES';

    const action = {
      style: 'negative',
      label: this._unpublish ? 'Unpublish & delete' : 'Delete',
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

  renderErrors() {
    const action = {
      style: 'accent',
      label: 'Copy errors to clipboard',
      click: async () => {
        const { items2Clipboard } = await import('./helpers/utils.js');
        items2Clipboard(this._itemErrors);
      },
    };

    return html`
      <da-dialog
        title="Errors"
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
      </div>
    `;
  }

  renderDropArea() {
    return html`
      <div class="da-drop-area" data-message=${this._dropMessage} @dragover=${this.dragover} @drop=${this.drop}></div>`;
  }

  renderCheckBox() {
    return html`
      <div class="checkbox-wrapper" role="columnheader">
        <input type="checkbox" id="select-all" name="select-all" .checked="${this.isSelectAll}" @click="${this.handleCheckAll}" aria-label="Select all items">
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
    const filteredItems = this._filter
      ? this._listItems.filter((item) => item.name.includes(this._filter))
      : this._listItems;

    return html`
      <div class="da-browse-panel-header" role="row">
        ${this.renderCheckBox()}
        <div class="da-browse-sort" role="presentation">
          <!-- Toggle button is split into 2 buttons (enable/disable) to prevent bug re-toggling on blur event -->
          <div role="columnheader" class="da-browse-sort-filter-container">
            ${!this._showFilter ? html`
              <button class="da-browse-filter" name="toggle-filter" @click=${() => this.toggleFilterView()} aria-label="Toggle filter">
                <img class="toggle-icon-dark" width="20" src="/blocks/browse/da-browse/img/Filter20.svg" alt="" />
              </button>
            ` : html`
              <button class="da-browse-filter selected" name="toggle-filter" @click=${() => this.toggleFilterView()} aria-label="Toggle filter">
                <img class="toggle-icon-dark" width="20" src="/blocks/browse/da-browse/img/Filter20.svg" alt="" />
              </button>
            `}
          </div>
          <div class="da-browse-header-container" role="columnheader" aria-sort="${this.getSortAttr(this._sortName) || 'none'}">
            <input @blur=${this.handleFilterBlur} name="filter" class=${this._showFilter ? 'show' : nothing} @change=${this.handleNameFilter} @keyup=${this.handleNameFilter} type="text" placeholder="Filter" aria-label="Filter items">
            <button class="da-browse-header-name ${this._sortName} ${this._showFilter ? 'hide' : ''}" @click=${this.handleNameSort}>Name</button>
          </div>
          <div class="da-browse-header-container" role="columnheader" aria-sort="${this.getSortAttr(this._sortDate) || 'none'}">
            <button class="da-browse-header-name ${this._sortDate}" @click=${this.handleDateSort}>Modified</button>
          </div>
        </div>
      </div>
      <div class="da-browse-panel" role="rowgroup" aria-label="File list" @dragenter=${this.drag ? this.dragenter : nothing} @dragleave=${this.drag ? this.dragleave : nothing}>
        ${filteredItems?.length > 0 ? this.renderList(filteredItems, true) : this.renderEmpty()}
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
      ${!this._confirm && this._itemErrors.length ? this.renderErrors() : nothing}
      `;
  }
}

customElements.define('da-list', DaList);
