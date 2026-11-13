import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2Api, getNxEWFlags } from '../../../scripts/utils.js';
import { fetchDaConfigs, getEditorConfigs } from '../../shared/utils.js';
import { getSiteFavorites, toggleFavorite } from '../../browse/shared/favorites.js';
import { updateBrowseSettings } from '../../browse/v2/shared/settings.js';
import { getRecentFiles } from '../../shared/recent-files.js';
import { getBrowseHref, getListItems, loadFilesByPath } from '../utils.js';
import '../../browse/v2/da-list/da-list.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
await import(`${getNx()}/blocks/shared/segmented-btn/segmented.js`);
const styles = await Promise.all([
  loadStyle(`${getNx()}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);

const VIEW_ITEMS = [
  { value: 'list', label: 'List view', icon: '/img/icons/s2-icon-viewlist-20-n.svg', iconOnly: true },
  { value: 'card', label: 'Grid view', icon: '/img/icons/s2-icon-viewgrid-20-n.svg', iconOnly: true },
];
const PAGE_SIZE = 4;
const MAX_FILES = 10;

function icon(name) {
  return html`<svg aria-hidden="true" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-${name}-20-n.svg#icon"></use></svg>`;
}

export class DaRecentFiles extends LitElement {
  static properties = {
    heading: { type: String },
    scopes: {
      attribute: false,
      hasChanged: (value, previous) => value?.join(',') !== previous?.join(','),
    },
    _files: { state: true },
    _favoriteFiles: { state: true },
    _error: { state: true },
    _actionError: { state: true },
    _favorites: { state: true },
    _tab: { state: true },
    _view: { state: true },
    _limit: { state: true },
    _editor: { state: true },
    _editorConfs: { state: true },
  };

  _onPageShow = ({ persisted }) => {
    if (!persisted) return;
    this.refreshFavorites();
    this.loadSite();
  };

  constructor() {
    super();
    this.heading = 'Files';
    this._tab = 'recent';
    this._view = 'list';
    this._limit = PAGE_SIZE;
    this._siteContexts = new Map();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = styles;
    window.addEventListener('pageshow', this._onPageShow);
    if (this.hasUpdated) this.loadSite();
  }

  disconnectedCallback() {
    this._request?.abort();
    window.removeEventListener('pageshow', this._onPageShow);
    super.disconnectedCallback();
  }

  updated(changed) {
    if (!changed.has('scopes')) return;
    this._tab = 'recent';
    this._limit = PAGE_SIZE;
    this._actionError = undefined;
    this.refreshFavorites();
    this.loadSite();
  }

  get path() {
    return this.scope ? `/${this.scope}` : '';
  }

  get scope() {
    return this.scopes?.[0];
  }

  get siteScopes() {
    return this.scopes ?? (this.scope ? [this.scope] : []);
  }

  get loading() {
    return !!this.scope && !this._error
      && (!this._files || (this._tab === 'starred' && !this._favoriteFiles));
  }

  async loadSite() {
    if (!this.isConnected) return;
    this._request?.abort();
    const request = new AbortController();
    this._request = request;
    this._files = undefined;
    this._favoriteFiles = null;
    this._error = undefined;
    this._editor = undefined;
    this._editorConfs = undefined;
    this._siteContexts = new Map();
    if (!this.scope) return;
    try {
      const [files, context] = await Promise.all([
        this.loadPreview('recent', request),
        this.getSiteContext(this.scope, request),
      ]);
      if (!this.isConnected || request.signal.aborted) return;
      this._editor = context.editor;
      this._editorConfs = context.editorConfs;
      this._files = files;
      if (this._tab === 'starred') await this.loadFavorites();
    } catch (error) {
      if (!request.signal.aborted && this.isConnected) this._error = error.message;
    }
  }

  async getSiteContext(scope, request, contexts = this._siteContexts) {
    if (!contexts.has(scope)) {
      const [org, site] = scope.split('/');
      contexts.set(scope, Promise.all([
        Promise.all(fetchDaConfigs({ org, site })),
        getNxEWFlags()
          .then(({ isEWEnabled }) => isEWEnabled({ org, site }))
          .then((enabled) => (enabled ? '/canvas#' : '/edit#'))
          .catch(() => '/edit#'),
      ]));
    }
    const [configs, editor] = await contexts.get(scope);
    request.signal.throwIfAborted();
    return { editor, editorConfs: getEditorConfigs(configs).editorConfs };
  }

  async loadPreview(tab, request, knownFiles = this._files) {
    const scopes = this.siteScopes;
    const contexts = this._siteContexts;
    const { source } = await getNx2Api();
    const files = [];
    const known = new Map((tab === 'starred' ? knownFiles : [])
      .map((item) => [item.path, item]));
    for (const scope of scopes) {
      const sitePath = `/${scope}`;
      const paths = tab === 'starred' ? getSiteFavorites(sitePath) : getRecentFiles(sitePath);
      let offset = 0;
      while (offset < paths.length && files.length < MAX_FILES) {
        request.signal.throwIfAborted();
        const batch = paths.slice(offset, offset + MAX_FILES - files.length);
        offset += batch.length;
        const missing = await loadFilesByPath(
          { paths: batch.filter((path) => !known.has(path)), source, signal: request.signal },
        );
        const available = new Map(missing.map((item) => [item.path, item]));
        const loaded = batch.map((path) => known.get(path) ?? available.get(path)).filter(Boolean);
        if (loaded.length) {
          const context = await this.getSiteContext(scope, request, contexts);
          files.push(...getListItems({
            files: loaded,
            favorites: this._favorites,
            ...context,
          }));
        }
      }
      if (files.length === MAX_FILES) break;
    }
    return files;
  }

  refreshFavorites() {
    this._favorites = new Set(this.siteScopes
      .flatMap((scope) => getSiteFavorites(`/${scope}`)));
  }

  async loadFavorites(knownFavorites = []) {
    if (!this._files || this._favoriteFiles !== null) return;
    const request = this._request;
    this.refreshFavorites();
    const paths = this.siteScopes.flatMap((scope) => getSiteFavorites(`/${scope}`))
      .slice(0, MAX_FILES);
    const known = new Map([...this._files, ...(knownFavorites ?? [])]
      .map((item) => [item.path, item]));
    if (paths.every((path) => known.has(path))) {
      this._favoriteFiles = paths.map((path) => known.get(path));
      return;
    }
    this._favoriteFiles = undefined;
    try {
      const files = await this.loadPreview('starred', request, [...known.values()]);
      if (this.isConnected && !request.signal.aborted) this._favoriteFiles = files;
    } catch (error) {
      if (!request.signal.aborted && this.isConnected) this._error = error.message;
    }
  }

  starFile(item) {
    const folder = item.path.slice(0, item.path.lastIndexOf('/'));
    const starred = toggleFavorite(folder, item.path);
    this.refreshFavorites();
    this._actionError = this._favorites.has(item.path) !== starred
      ? 'Could not save your favorites. Check that browser storage is available.' : undefined;
    const knownFavorites = this._favoriteFiles;
    this._favoriteFiles = null;
    if (this._tab === 'starred') this.loadFavorites(knownFavorites);
  }

  getFavoriteFiles() {
    const files = new Map([...(this._favoriteFiles ?? []), ...this._files]
      .map((item) => [item.path, item]));
    return [...files.values()]
      .filter((item) => this._favorites.has(item.path));
  }

  changeTab(value) {
    this._tab = value;
    this._limit = PAGE_SIZE;
    return value === 'starred' ? this.loadFavorites() : undefined;
  }

  changeView({ detail: { value } }) {
    if (!['card', 'list'].includes(value)) return;
    this._view = value;
    updateBrowseSettings({ view: value });
  }

  renderFiles() {
    if (this._error) {
      return html`<div class="empty-state"><p role="alert">${this._error}</p>
        <button class="nx-action-btn" @click=${this.loadSite}>Try again</button></div>`;
    }
    if (this.loading) return html`<p class="loading" role="status"><span class="nx-loading-spinner" aria-hidden="true"></span>Loading files...</p>`;
    const files = this._tab === 'starred' ? this.getFavoriteFiles() : this._files;
    if (!files.length) {
      return html`<div class="empty-state is-empty">${icon(this._tab === 'starred' ? 'star' : 'folder')}
        <h3>${this._tab === 'starred' ? 'No favorites yet' : 'No recent files yet'}</h3>
        <p>${this._tab === 'starred' ? 'Add a file in Browse to favorites to keep it close.' : 'Open a file to see it here.'}</p>
      </div>`;
    }
    const total = Math.min(files.length, MAX_FILES);
    const visible = files.slice(0, Math.min(this._limit, total));
    const items = getListItems({
      files: visible,
      favorites: this._favorites,
      editor: this._editor || '/edit#',
      editorConfs: this._editorConfs,
    }).map((item, index) => ({
      ...item,
      ...visible[index],
      isFavorited: this._favorites.has(item.path),
      folderLabel: item.path.slice(0, item.path.lastIndexOf('/')),
    }));
    return html`
      <div id="files-list" class="file-list" role="grid" aria-label=${this._tab === 'starred' ? 'Favorite files' : 'Recent files'}
        tabindex="0">
        <da-list .listItems=${items} .view=${this._view}
          .showFolder=${true} .sort=${false}
          size="s"
          @favoritechange=${({ detail: { item } }) => this.starFile(item)}></da-list>
      </div>
      ${this.renderFooter(total)}`;
  }

  renderFooter(total) {
    return html`<div class="files-footer">
        ${total > PAGE_SIZE ? html`
          <button class="show-more nx-action-btn-quiet nx-btn-sm"
            aria-controls="files-list" aria-expanded=${this._limit > PAGE_SIZE}
            @click=${() => {
          this._limit = this._limit === PAGE_SIZE ? MAX_FILES : PAGE_SIZE;
        }}>
            ${this._limit > PAGE_SIZE ? 'Show fewer' : 'Show more'}
          </button>` : nothing}
      </div>`;
  }

  render() {
    if (!this.scope) return nothing;
    return html`<div class="landing">
      <section class="files-panel" data-view=${this._view} aria-labelledby="files-heading">
        <div class="panel-heading">
          <h2 id="files-heading">${this.heading}</h2>
          <nx-segmented-btn label="File view" size="m" .items=${VIEW_ITEMS}
            .value=${this._view} @change=${this.changeView}></nx-segmented-btn>
        </div>
        <div class="files-toolbar">
          <div class="file-filters" role="group" aria-label="Filter files">
            <button class="filter" type="button" aria-pressed=${this._tab === 'recent'}
              title="Files you opened recently"
              @click=${() => this.changeTab('recent')}>${icon('history')}Recent</button>
            <button class="filter" type="button" aria-pressed=${this._tab === 'starred'}
              @click=${() => this.changeTab('starred')}>${icon('star')}Favorite</button>
          </div>
          <a class="all-files" aria-label=${`Browse ${this.scope}`}
            href=${getBrowseHref({ path: this.path })}>Show All</a>
        </div>
        ${this._actionError ? html`<p role="alert">${this._actionError}</p>` : nothing}
        <div aria-busy=${this.loading}>${this.renderFiles()}</div>
      </section>
    </div>`;
  }
}

customElements.define('da-recent-files', DaRecentFiles);
