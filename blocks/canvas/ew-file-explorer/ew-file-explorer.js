import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { listFolder, itemHashPath } from '../../shared/daFiles.js';
import { treeKeydown, treeFocusIn, treeEnsureTabStop } from '../utils/tree-nav.js';
import getEditPath from '../../browse/shared.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

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

class EwFileExplorer extends LitElement {
  static properties = {
    _cache: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _expanded: { state: true },
    _selectedPath: { state: true },
    _treeRoot: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
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
    document.addEventListener('nx-agent-change', this._onAgentChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubHash?.();
    document.removeEventListener('nx-agent-change', this._onAgentChange);
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
      return;
    }

    this._selectedPath = path ? `${org}/${site}/${path}` : undefined;

    if (rootChanged) {
      this._cache = {};
      this._expanded = new Set();
      this._treeRoot = null;
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

  _renderNode(item, depth) {
    const { type, pathKey, name, children } = item;
    const isDir = type === 'directory';
    const expanded = isDir && this._expanded?.has(pathKey);
    const hashPath = itemHashPath(item);
    const selected = this._selectedPath === hashPath;

    return html`
      <li role="none">
        <button type="button" role="treeitem"
          class="row${isDir ? '' : ' file'}${selected ? ' selected' : ''}"
          style="--depth: ${depth}"
          tabindex="-1"
          aria-expanded="${isDir ? expanded : nothing}"
          aria-selected="${selected}"
          @click="${() => this._onItemClick(item)}">
          <span class="label">${name}</span>
        </button>
        ${expanded && children.length ? html`
          <ul role="group">
            ${children.map((c) => this._renderNode(c, depth + 1))}
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
      <ul class="tree" role="tree" aria-label="Files"
        @keydown="${(e) => treeKeydown(e, this.shadowRoot)}"
        @focusin="${(e) => treeFocusIn(e, this.shadowRoot)}">
        ${tree.map((item) => this._renderNode(item, 0))}
      </ul>
    </div>`;
  }
}

customElements.define('ew-file-explorer', EwFileExplorer);
