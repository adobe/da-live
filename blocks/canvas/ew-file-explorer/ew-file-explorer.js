import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2, getNx2Api } from '../../../scripts/utils.js';
import { listFolder, itemHashPath, getAemUrl } from '../../shared/daFiles.js';
import { iconPathForExt } from '../../shared/icons.js';
import { EMPTY_DOC } from '../../shared/utils.js';
import { treeKeydown, treeFocusIn, treeEnsureTabStop } from '../utils/tree-nav.js';
import getEditPath from '../../browse/shared.js';
import getSheet from '../../shared/sheet.js';
import '../../shared/da-name-dialog/da-name-dialog.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);
const { CHAT_EVENT } = await import(`${getNx()}/blocks/chat/constants.js`);
const { crawl } = await import(`${getNx()}/public/utils/tree.js`);
await import(`${getNx()}/blocks/shared/picker/picker.js`);

const [buttons, style] = await Promise.all([
  getSheet(`${getNx2()}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);

const CREATE_PAGE_ERROR = 'Could not create the page. Try a different name.';

const COPYABLE_EXTS = new Set(['html', 'json']);

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'page', label: 'Pages' },
  { value: 'sheet', label: 'Sheets' },
  { value: 'fragment', label: 'Fragments' },
];

// Fragments are just pages that live under a /fragments/ folder anywhere in the path.
function categoryForFile(item) {
  if (item.ext === 'json') return 'sheet';
  if (item.ext !== 'html') return null;
  const parts = (item.path || '').replace(/^\//, '').split('/');
  return parts.includes('fragments') ? 'fragment' : 'page';
}

function listItemToNode(item, cache) {
  const pathKey = (item.path || '').replace(/^\//, '');
  const fullpath = `/${pathKey}`;
  const isDir = !item.ext;
  return {
    name: item.name,
    type: isDir ? 'directory' : 'file',
    path: fullpath,
    pathKey,
    ext: item.ext,
    children: isDir && cache[fullpath]
      ? cache[fullpath].map((child) => listItemToNode(child, cache))
      : [],
  };
}

function buildTree(cache, rootFullpath) {
  const pathKey = rootFullpath.replace(/^\//, '');
  const items = cache[rootFullpath];
  return [{
    name: pathKey.split('/').pop(),
    type: 'directory',
    path: rootFullpath,
    pathKey,
    children: items ? items.map((item) => listItemToNode(item, cache)) : [],
  }];
}

const REFRESH_ICON_SRC = '/img/icons/s2-icon-refresh-20-n.svg';
const ADD_ICON_SRC = '/img/icons/s2-icon-fileadd-20-n.svg';
const SEARCH_ICON_SRC = '/img/icons/s2-icon-search-20-n.svg';
const CLEAR_ICON_SRC = '/img/icons/s2-icon-close-20-n.svg';
const COPY_ICON_SRC = '/img/icons/s2-icon-paste-20-n.svg';
const CHECKMARK_ICON_SRC = '/img/icons/s2-icon-checkmark-20-n.svg';
const REFRESH_ICON_HTML = `<svg aria-hidden="true" class="icon" viewBox="0 0 20 20"><use href="${REFRESH_ICON_SRC}#icon"></use></svg>`;
const REFRESH_SPINNER_HTML = '<span class="da-loading-spinner" aria-hidden="true"></span>';

class EwFileExplorer extends LitElement {
  static properties = {
    _cache: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _expanded: { state: true },
    _selectedPath: { state: true },
    _treeRoot: { state: true },
    _searchTerm: { state: true },
    _searchResults: { state: true },
    _searching: { state: true },
    _category: { state: true },
    _matchingFolders: { state: true },
    _categoryCrawling: { state: true },
    _createDialog: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this._category ??= 'all';
    this.shadowRoot.adoptedStyleSheets = [buttons, style];
    this._unsubHash = hashChange.subscribe((state) => this._onHashChange(state));
    this._onAgentChange = async ({ detail }) => {
      if (detail?.scope !== 'file') return;
      const toRefresh = (detail.paths ?? []).filter((p) => this._cache?.[p]);
      if (!toRefresh.length) return;
      const updates = await Promise.all(toRefresh.map(async (p) => {
        const result = await listFolder(p);
        return Array.isArray(result) ? [p, result] : null;
      }));
      const patched = Object.fromEntries(updates.filter(Boolean));
      if (Object.keys(patched).length) this._cache = { ...this._cache, ...patched };
    };
    document.addEventListener(CHAT_EVENT.AGENT_CHANGE, this._onAgentChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubHash?.();
    document.removeEventListener(CHAT_EVENT.AGENT_CHANGE, this._onAgentChange);
    this._clearSearch();
    this._resetCategoryCrawl();
    this._clearCrawlCache();
  }

  updated() {
    treeEnsureTabStop(this.shadowRoot);
  }

  _onHashChange({ org, site, path }) {
    const rootChanged = org !== this._org || site !== this._site;
    this._org = org;
    this._site = site;

    if (!org || !site) {
      this._cache = {};
      this._expanded = new Set();
      this._selectedPath = undefined;
      this._error = null;
      this._treeRoot = null;
      this._clearSearch();
      this._category = 'all';
      this._resetCategoryCrawl();
      return;
    }

    this._selectedPath = path ? `${org}/${site}/${path}` : undefined;

    if (rootChanged) {
      this._cache = {};
      this._expanded = new Set();
      this._treeRoot = null;
      this._clearSearch();
      this._category = 'all';
      this._resetCategoryCrawl();
      this._clearCrawlCache();
      this._loadFromLeaves(org, site, path);
    } else if (path) {
      this._expandToPath(path);
    }
  }

  // Ensure every ancestor folder of `path` is expanded and loaded, so the
  // newly selected item is visible after a hash change within the same site.
  // If the new page's parent folder isn't accessible, switches the explorer
  // into the "Not permitted" state instead.
  async _expandToPath(path) {
    if (!this._treeRoot) {
      this._loadFromLeaves(this._org, this._site, path);
      return;
    }

    const orgSite = `${this._org}/${this._site}`;
    const parts = path.split('/');
    const parentFp = parts.length > 1
      ? `/${orgSite}/${parts.slice(0, -1).join('/')}`
      : `/${orgSite}`;

    if (!this._cache?.[parentFp]) {
      const result = await listFolder(parentFp);
      if (!Array.isArray(result)) {
        this._cache = {};
        this._expanded = new Set();
        this._treeRoot = null;
        this._error = 'Not permitted';
        return;
      }
      this._cache = { ...this._cache, [parentFp]: result };
    }

    const expanded = new Set(this._expanded ?? []);
    const toFetch = [];
    for (let i = 1; i < parts.length; i += 1) {
      const ancestorFp = `/${orgSite}/${parts.slice(0, i).join('/')}`;
      expanded.add(ancestorFp.replace(/^\//, ''));
      if (!this._cache?.[ancestorFp]) toFetch.push(ancestorFp);
    }
    this._expanded = expanded;

    if (!toFetch.length) return;
    const results = await Promise.all(toFetch.map(async (fp) => {
      const result = await listFolder(fp);
      return Array.isArray(result) ? [fp, result] : null;
    }));
    const patched = Object.fromEntries(results.filter(Boolean));
    if (Object.keys(patched).length) this._cache = { ...this._cache, ...patched };
  }

  // Walks from the current page's parent folder up to the site root, fetching
  // each level sequentially. Stops as soon as a level fails (the user may have
  // permission on a subfolder but not its ancestors). If the very first fetch
  // fails, treats it as "not permitted" and shows no tree.
  async _loadFromLeaves(org, site, path) {
    this._loading = true;
    this._error = null;
    const cache = {};
    const orgSite = `${org}/${site}`;
    const expanded = new Set();
    const rootFullpath = `/${orgSite}`;

    const pathsToFetch = [];
    if (path) {
      const parts = path.split('/');
      for (let i = parts.length - 1; i >= 1; i -= 1) {
        pathsToFetch.push(`/${orgSite}/${parts.slice(0, i).join('/')}`);
      }
    }
    pathsToFetch.push(rootFullpath);

    let treeRoot = null;

    try {
      for (let i = 0; i < pathsToFetch.length; i += 1) {
        const fp = pathsToFetch[i];
        // eslint-disable-next-line no-await-in-loop
        const result = await listFolder(fp);
        if (Array.isArray(result)) {
          cache[fp] = result;
          treeRoot = fp;
          expanded.add(fp.replace(/^\//, ''));
        } else {
          if (i === 0) this._error = 'Not permitted';
          break;
        }
      }
      this._cache = cache;
      this._expanded = expanded;
      this._treeRoot = treeRoot;
    } finally {
      this._loading = false;
    }
  }

  async _loadAndExpand(pathKey) {
    this._loading = true;
    const result = await listFolder(`/${pathKey}`);
    if (Array.isArray(result)) {
      this._cache = { ...this._cache, [`/${pathKey}`]: result };
      this._expanded = new Set([...(this._expanded ?? []), pathKey]);
    }
    this._loading = false;
  }

  async _refreshPath(fullpath) {
    const result = await listFolder(fullpath);
    if (!Array.isArray(result)) return false;
    this._cache = { ...this._cache, [fullpath]: result };
    this._expanded = new Set([...(this._expanded ?? []), fullpath.replace(/^\//, '')]);
    return true;
  }

  async _onRefreshClick() {
    if (this._refreshing) return;
    this._refreshing = true;
    if (this._headerRefreshBtn) {
      this._headerRefreshBtn.disabled = true;
      this._headerRefreshBtn.innerHTML = REFRESH_SPINNER_HTML;
    }
    try {
      const expandedFullpaths = [...(this._expanded ?? [])].map((key) => `/${key}`);
      const targets = new Set([this._treeRoot, ...expandedFullpaths].filter(Boolean));
      await Promise.all([...targets].map((fp) => this._refreshPath(fp)));
    } finally {
      this._refreshing = false;
      if (this._headerRefreshBtn) {
        this._headerRefreshBtn.disabled = false;
        this._headerRefreshBtn.innerHTML = REFRESH_ICON_HTML;
      }
    }
  }

  _getHeaderRefreshButton() {
    if (this._headerRefreshBtn) return this._headerRefreshBtn;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'da-icon-btn';
    btn.setAttribute('aria-label', 'Refresh files');
    btn.innerHTML = REFRESH_ICON_HTML;
    btn.addEventListener('click', () => this._onRefreshClick());
    this._headerRefreshBtn = btn;
    return btn;
  }

  getHeaderActions() {
    return this._getHeaderRefreshButton();
  }

  _toggle(pathKey, path) {
    if (!this._cache?.[path]) {
      this._loadAndExpand(pathKey);
      return;
    }
    const next = new Set(this._expanded);
    if (next.has(pathKey)) next.delete(pathKey);
    else next.add(pathKey);
    this._expanded = next;
  }

  _onItemClick(item) {
    if (item.type === 'directory') {
      this._toggle(item.pathKey, item.path);
      return;
    }
    if (item.ext === 'html') {
      window.location.hash = `#/${itemHashPath(item)}`;
      return;
    }
    if (item.ext === 'link') return;
    const url = getEditPath({ path: item.path, ext: item.ext, editor: '' });
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async _onCopyUrl(e, item) {
    e.stopPropagation();
    const url = getAemUrl(item);
    if (!url) return;
    await navigator.clipboard.writeText(url);
  }

  // Crawls the site once per root, streaming files into `entry.files` as they're
  // found (via crawl()'s per-file callback) rather than waiting for the whole
  // site to finish. `entry.listeners` are notified on a short interval (not per
  // file) so search results can update live without hammering render() on huge
  // sites. Cached so repeated searches never re-crawl.
  _getCrawlEntry() {
    const root = this._treeRoot;
    this._crawlCache ??= {};
    if (!this._crawlCache[root]) {
      const entry = { files: [], done: false, listeners: new Set() };
      const notify = () => entry.listeners.forEach((fn) => fn());
      const { results, cancelCrawl } = crawl({
        path: root,
        throttle: 20,
        callback: (file) => { entry.files.push(file); },
      });
      entry.cancelCrawl = cancelCrawl;
      entry.flushTimer = setInterval(notify, 150);
      results.then(() => {
        entry.done = true;
        clearInterval(entry.flushTimer);
        notify();
      });
      this._crawlCache[root] = entry;
    }
    return this._crawlCache[root];
  }

  // Starts the crawl on first interaction with the search bar (focusing the input
  // or opening the category picker) instead of waiting for the first keystroke or
  // category pick, so results feel instant once the user actually filters.
  _warmCrawl() {
    if (!this._treeRoot) return;
    this._getCrawlEntry();
  }

  _clearCrawlCache() {
    Object.values(this._crawlCache ?? {}).forEach((entry) => {
      clearInterval(entry.flushTimer);
      entry.cancelCrawl?.();
    });
    this._crawlCache = {};
  }

  _runSearch(term) {
    this._searchUnsub?.();
    this._searchUnsub = null;
    if (!term) {
      this._searchResults = null;
      this._searching = false;
      return;
    }
    const entry = this._getCrawlEntry();
    const lower = term.toLowerCase();
    const category = this._category ?? 'all';
    const applyFilter = () => {
      this._searchResults = entry.files.filter((f) => {
        if (!f.name?.toLowerCase().includes(lower)) return false;
        if (category !== 'all' && categoryForFile(f) !== category) return false;
        return true;
      });
      this._searching = !entry.done;
    };
    applyFilter();
    entry.listeners.add(applyFilter);
    this._searchUnsub = () => entry.listeners.delete(applyFilter);
  }

  // Selecting a category kicks off (or reuses) the same site crawl search uses, so
  // folders that provably contain no matches can be hidden rather than just leaving
  // their files filtered once expanded. Results narrow in as the crawl streams in,
  // same as search.
  _onCategoryChange(e) {
    this._category = e.detail.value;
    this._resetCategoryCrawl();
    if (this._category !== 'all') {
      const entry = this._getCrawlEntry();
      const recompute = () => {
        this._matchingFolders = this._buildMatchingFolders(entry.files);
        this._categoryCrawling = !entry.done;
      };
      recompute();
      entry.listeners.add(recompute);
      this._categoryUnsub = () => entry.listeners.delete(recompute);
    }
    if (this._searchTerm) this._runSearch(this._searchTerm);
  }

  _resetCategoryCrawl() {
    this._categoryUnsub?.();
    this._categoryUnsub = null;
    this._matchingFolders = null;
    this._categoryCrawling = false;
  }

  // Every ancestor folder pathKey of a file matching the active category, so
  // _visibleChildren can hide folders that provably contain no matches.
  _buildMatchingFolders(files) {
    const folders = new Set();
    files.forEach((f) => {
      if (categoryForFile(f) !== this._category) return;
      const parts = (f.path || '').replace(/^\//, '').split('/');
      for (let i = 1; i < parts.length; i += 1) folders.add(parts.slice(0, i).join('/'));
    });
    return folders;
  }

  // Files are narrowed directly by category. Folders are hidden only once the
  // active-category crawl proves they contain no matching descendant.
  _visibleChildren(children) {
    if (this._category === 'all' || !children) return children;
    return children.filter((c) => {
      if (c.type === 'directory') return this._matchingFolders?.has(c.pathKey) ?? false;
      return categoryForFile(c) === this._category;
    });
  }

  _onSearchInput(e) {
    const term = e.target.value.trim();
    if (!term) {
      this._clearSearch();
      return;
    }
    this._searchTerm = term;
    clearTimeout(this._searchDebounceId);
    // Mark searching immediately so the "no matches" state can't flash during
    // the debounce window, before _runSearch has even looked at this term.
    this._searching = true;
    this._searchDebounceId = setTimeout(() => this._runSearch(term), 200);
  }

  _onSearchKeydown(e) {
    if (e.key !== 'Escape') return;
    e.target.value = '';
    this._clearSearch();
  }

  _onClearClick() {
    const input = this.shadowRoot.querySelector('.search-input');
    if (input) input.value = '';
    this._clearSearch();
  }

  _clearSearch() {
    clearTimeout(this._searchDebounceId);
    this._searchUnsub?.();
    this._searchUnsub = null;
    this._searchTerm = '';
    this._searchResults = null;
    this._searching = false;
  }

  // Path hint is shown relative to the explorer's root (usually the site root, but
  // may be a deeper folder when the user only has permission on a subtree) — the
  // org/site prefix is always the same for every row here, so it's just noise.
  _relativeParentPath(item) {
    const fullParent = item.path.replace(/^\//, '').split('/').slice(0, -1).join('/');
    const rootPathKey = (this._treeRoot || '').replace(/^\//, '');
    if (fullParent === rootPathKey) return '';
    if (fullParent.startsWith(`${rootPathKey}/`)) return fullParent.slice(rootPathKey.length + 1);
    return fullParent;
  }

  // Copyable rows show the exact URL the copy button would copy. Other rows
  // (folders, images, etc.) have nothing to copy, so no title is needed.
  _rowTitle(item) {
    return COPYABLE_EXTS.has(item.ext) ? getAemUrl(item) : '';
  }

  _renderSearchResult(item) {
    const hashPath = itemHashPath(item);
    const selected = this._selectedPath === hashPath;
    const copyable = COPYABLE_EXTS.has(item.ext);
    const parentPath = this._relativeParentPath(item);

    return html`
      <li role="none">
        <div class="row-wrap${selected ? ' selected' : ''}"
          @click="${() => this._onItemClick(item)}">
          <button type="button" class="row file" title="${this._rowTitle(item) || nothing}">
            <svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="${iconPathForExt(item.ext)}#icon"></use></svg>
            <span class="label">
              ${item.name}
              <span class="path-hint">${parentPath}</span>
            </span>
          </button>
          ${copyable ? html`
            <button type="button" class="copy-url" tabindex="-1" title="Copy URL" aria-label="Copy URL for ${item.name}"
              @click="${(e) => this._onCopyUrl(e, item)}">
              <svg class="icon-paste" viewBox="0 0 20 20" aria-hidden="true"><use href="${COPY_ICON_SRC}#icon"></use></svg>
              <svg class="icon-checkmark" viewBox="0 0 20 20" aria-hidden="true"><use href="${CHECKMARK_ICON_SRC}#icon"></use></svg>
            </button>` : nothing}
        </div>
      </li>`;
  }

  _categoryLabel() {
    return CATEGORIES.find((c) => c.value === this._category)?.label;
  }

  _renderSearchList() {
    const count = this._searchResults?.length ?? 0;
    const hasResults = count > 0;
    const categoryLabel = this._categoryLabel();
    const scope = this._category !== 'all' && categoryLabel ? ` in ${categoryLabel}` : '';
    let statusText;
    if (this._searching) statusText = 'Searching…';
    else if (hasResults) statusText = `${count} result${count === 1 ? '' : 's'} found`;
    else statusText = `No matches${scope} for "${this._searchTerm}".`;

    return html`
      <p class="notice search-status">${statusText}</p>
      ${hasResults ? html`
        <ul class="tree" role="list" aria-label="Search results">
          ${this._searchResults.map((item) => this._renderSearchResult(item))}
        </ul>` : nothing}
    `;
  }

  _openCreateDialog(e, item) {
    e.stopPropagation();
    e.preventDefault();
    this._createDialog = { folder: item.path, saving: false, error: null };
  }

  _closeCreateDialog() {
    this._createDialog = null;
  }

  async _handleCreateSubmit(e) {
    const { name, openAfter } = e.detail;
    const { folder } = this._createDialog;
    this._createDialog = { ...this._createDialog, error: null, saving: true };
    try {
      const path = `${folder}/${name}.html`;
      const { source } = await getNx2Api();
      const resp = await source.save(path, { body: EMPTY_DOC });
      if (!resp?.ok) {
        this._createDialog = { ...this._createDialog, error: CREATE_PAGE_ERROR, saving: false };
        return;
      }
      this._closeCreateDialog();
      await this._refreshPath(folder);
      if (openAfter) {
        window.location.hash = `#/${itemHashPath({ path, ext: 'html' })}`;
      }
    } catch {
      this._createDialog = { ...this._createDialog, error: CREATE_PAGE_ERROR, saving: false };
    }
  }

  _renderNode(item, depth) {
    const { type, pathKey, name, children, ext } = item;
    const isDir = type === 'directory';
    const expanded = isDir && this._expanded?.has(pathKey);
    const hashPath = itemHashPath(item);
    const selected = !isDir && this._selectedPath === hashPath;
    const copyable = COPYABLE_EXTS.has(ext);
    const visibleChildren = this._visibleChildren(children);

    return html`
      <li role="none">
        <div class="row-wrap${selected ? ' selected' : ''}" style="--depth: ${depth}"
          @click="${() => this._onItemClick(item)}">
          <button type="button" role="treeitem"
            class="row${isDir ? '' : ' file'}"
            tabindex="-1"
            title="${this._rowTitle(item) || nothing}"
            aria-expanded="${isDir ? expanded : nothing}"
            aria-selected="${selected}">
            <svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="${iconPathForExt(ext)}#icon"></use></svg>
            <span class="label">${name}</span>
          </button>
          ${copyable ? html`
            <button type="button" class="copy-url" tabindex="-1" title="Copy URL" aria-label="Copy URL for ${name}"
              @click="${(e) => this._onCopyUrl(e, item)}">
              <svg class="icon-paste" viewBox="0 0 20 20" aria-hidden="true"><use href="${COPY_ICON_SRC}#icon"></use></svg>
              <svg class="icon-checkmark" viewBox="0 0 20 20" aria-hidden="true"><use href="${CHECKMARK_ICON_SRC}#icon"></use></svg>
            </button>` : nothing}
          ${isDir ? html`
            <button type="button" class="nx-action-btn-icon nx-btn-sm action-btn new-page-btn" draggable="false"
              aria-label="New page in ${name}"
              @pointerdown=${(e) => e.stopPropagation()}
              @click=${(e) => this._openCreateDialog(e, item)}>
              <svg aria-hidden="true" viewBox="0 0 20 20">
                <use href="${ADD_ICON_SRC}#icon"></use>
              </svg>
            </button>` : nothing}
        </div>
        ${expanded && visibleChildren.length ? html`
          <ul role="group">
            ${visibleChildren.map((c) => this._renderNode(c, depth + 1))}
          </ul>` : nothing}
      </li>`;
  }

  render() {
    if (!this._org || !this._site) {
      return html`<div class="ew-file-explorer">
        <p class="placeholder">Select a site to browse files.</p>
      </div>`;
    }

    if (!this._treeRoot) {
      return html`<div class="ew-file-explorer">
        ${this._error
    ? html`<p class="notice centered" role="alert">${this._error}</p>`
    : html`<p class="notice centered">Loading…</p>`}
      </div>`;
    }

    const tree = buildTree(this._cache ?? {}, this._treeRoot);

    return html`<div class="ew-file-explorer">
      <div class="search-bar" @focusin="${() => this._warmCrawl()}">
        <svg class="search-icon" viewBox="0 0 20 20" aria-hidden="true"><use href="${SEARCH_ICON_SRC}#icon"></use></svg>
        <input type="search" class="search-input" placeholder="Filter files" aria-label="Filter files"
          .value="${this._searchTerm ?? ''}"
          @input="${(e) => this._onSearchInput(e)}"
          @keydown="${(e) => this._onSearchKeydown(e)}">
        <button type="button" class="search-clear" aria-label="Clear search" @click="${() => this._onClearClick()}">
          <svg viewBox="0 0 20 20" aria-hidden="true"><use href="${CLEAR_ICON_SRC}#icon"></use></svg>
        </button>
        <nx-picker
          .items="${CATEGORIES}"
          .value="${this._category ?? 'all'}"
          placement="below-end"
          @change="${(e) => this._onCategoryChange(e)}">
        </nx-picker>
      </div>
      ${this._searchTerm ? this._renderSearchList() : html`
        ${this._categoryCrawling ? html`
          <p class="notice search-status">Scanning for ${(this._categoryLabel() ?? '').toLowerCase()}…</p>` : nothing}
        <ul class="tree" role="tree" aria-label="Files"
          @keydown="${(e) => treeKeydown(e, this.shadowRoot)}"
          @focusin="${(e) => treeFocusIn(e, this.shadowRoot)}">
          ${tree.map((item) => this._renderNode(item, 0))}
        </ul>`}
      <da-name-dialog
        dialog-title="New page in ${this._createDialog?.folder?.split('/').pop() ?? ''}"
        name-placeholder="page name"
        ?open=${!!this._createDialog}
        ?saving=${this._createDialog?.saving}
        show-create-and-open
        error=${this._createDialog?.error ?? ''}
        @da-name-submit=${this._handleCreateSubmit}
        @close=${this._closeCreateDialog}>
      </da-name-dialog>
    </div>`;
  }
}

customElements.define('ew-file-explorer', EwFileExplorer);
