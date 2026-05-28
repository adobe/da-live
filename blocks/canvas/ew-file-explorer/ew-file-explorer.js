import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { listFolder, itemHashPath } from '../../shared/daFiles.js';
import { treeKeydown, treeFocusIn, treeEnsureTabStop } from '../utils/tree-nav.js';

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
      return;
    }

    this._selectedPath = path ? `${org}/${site}/${path}` : undefined;

    if (rootChanged) {
      this._cache = {};
      this._expanded = new Set([`${org}/${site}`]);
      this._loadFromRoot(`/${org}/${site}`, org, site, path);
    }
  }

  async _loadFromRoot(rootFullpath, org, site, path) {
    this._loading = true;
    this._error = null;
    const cache = {};
    const orgSite = `${org}/${site}`;
    const expanded = new Set([orgSite]);
    const toFetch = [rootFullpath];

    if (path) {
      const parts = path.split('/');
      for (let i = 1; i < parts.length; i += 1) {
        const ancestorPath = `/${orgSite}/${parts.slice(0, i).join('/')}`;
        toFetch.push(ancestorPath);
        expanded.add(ancestorPath.replace(/^\//, ''));
      }
    }

    try {
      await Promise.all(toFetch.map(async (fp) => {
        const result = await listFolder(fp);
        if (Array.isArray(result)) cache[fp] = result;
        else if (fp === rootFullpath) this._error = result.error;
      }));
      this._cache = cache;
      this._expanded = expanded;
    } finally {
      this._loading = false;
    }
  }

  async _loadAndExpand(pathKey) {
    this._loading = true;
    const result = await listFolder(`/${pathKey}`);
    if (!Array.isArray(result)) {
      this._error = result.error;
    } else {
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

  _renderNode(item, depth) {
    const { type, pathKey, name, children, path } = item;
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
          @click="${isDir ? () => this._toggle(pathKey, path) : () => { window.location.hash = `#/${hashPath}`; }}">
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

    const tree = buildTree(this._cache ?? {}, `/${this._org}/${this._site}`);

    return html`<div class="ew-file-explorer">
      ${this._error ? html`<p class="notice error" role="alert">${this._error}</p>` : nothing}
      ${this._loading && !Object.keys(this._cache ?? {}).length
        ? html`<p class="notice">Loading…</p>` : nothing}
      <ul class="tree" role="tree" aria-label="Files"
        @keydown="${(e) => treeKeydown(e, this.shadowRoot)}"
        @focusin="${(e) => treeFocusIn(e, this.shadowRoot)}">
        ${tree.map((item) => this._renderNode(item, 0))}
      </ul>
    </div>`;
  }
}

customElements.define('ew-file-explorer', EwFileExplorer);
