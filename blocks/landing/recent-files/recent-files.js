import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2, getNx2Api, getNxEWFlags } from '../../../scripts/utils.js';
import { fetchDaConfigs, getEditorConfigs } from '../../shared/utils.js';
import { getSiteFavorites, toggleFavorite } from '../../browse/shared/favorites.js';
import { getBrowseSettings, updateBrowseSettings } from '../../browse/v2/shared/settings.js';
import { getRecentFiles } from '../../shared/recent-files.js';
import { getBrowseHref, getListItems, loadFilesByPath } from '../utils.js';
import '../../browse/v2/da-list/da-list.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
await import(`${getNx()}/blocks/shared/segmented-btn/segmented.js`);
const styles = await Promise.all([
  loadStyle(`${getNx2()}/styles/buttons.css`),
  loadStyle(`${getNx2()}/styles/spinner.css`),
  loadStyle(import.meta.url),
]);

const VIEW_ITEMS = [
  { value: 'list', label: 'List view', icon: '/img/icons/s2-icon-viewlist-20-n.svg', iconOnly: true },
  { value: 'card', label: 'Grid view', icon: '/img/icons/s2-icon-viewgrid-20-n.svg', iconOnly: true },
];
const PAGE_SIZE = 6;
const MAX_FILES = 18;

function icon(name) {
  return html`<svg aria-hidden="true" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-${name}-20-n.svg#icon"></use></svg>`;
}

export class DaRecentFiles extends LitElement {
  static properties = {
    _scope: { state: true },
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
    if (this._scope) this.loadSite();
  };

  constructor() {
    super();
    this._tab = 'recent';
    this._view = getBrowseSettings().view === 'list' ? 'list' : 'card';
    this._limit = PAGE_SIZE;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = styles;
    this.refreshFavorites();
    window.addEventListener('pageshow', this._onPageShow);
    this.loadSite();
  }

  disconnectedCallback() {
    this._request?.abort();
    window.removeEventListener('pageshow', this._onPageShow);
    super.disconnectedCallback();
  }

  get path() {
    return this._scope ? `/${this._scope}` : '';
  }

  get loading() {
    return !!this._scope && !this._error
      && (!this._files || (this._tab === 'starred' && !this._favoriteFiles));
  }

  async setScope(state) {
    const scope = state?.org && state?.site ? `${state.org}/${state.site}` : undefined;
    if (this._scope === scope && this._request && !this._request.signal.aborted) return;
    this._scope = scope;
    this._tab = 'recent';
    this._limit = PAGE_SIZE;
    this._actionError = undefined;
    this.refreshFavorites();
    if (this.isConnected) await this.loadSite();
  }

  async loadSite() {
    if (!this.isConnected) return;
    this._request?.abort();
    const request = new AbortController();
    this._request = request;
    this._files = undefined;
    this._favoriteFiles = null; // Not requested yet; undefined while loading.
    this._error = undefined;
    this._editor = undefined;
    this._editorConfs = undefined;
    if (!this._scope) return;
    const [org, site] = this._scope.split('/');
    const editor = getNxEWFlags()
      .then(({ isEWEnabled }) => isEWEnabled({ org, site }))
      .then((enabled) => (enabled ? '/canvas#' : '/edit#'))
      .catch(() => '/edit#');
    const recent = getRecentFiles(this.path);
    try {
      const { source } = await getNx2Api();
      const [files, configs, destination] = await Promise.all([
        loadFilesByPath({ paths: recent, source, signal: request.signal }),
        Promise.all(fetchDaConfigs({ org, site })),
        editor,
      ]);
      if (!this.isConnected || request.signal.aborted) return;
      this._editor = destination;
      this._editorConfs = getEditorConfigs(configs).editorConfs;
      this._files = files;
      if (this._tab === 'starred') await this.loadFavorites();
    } catch (error) {
      if (!request.signal.aborted && this.isConnected) this._error = error.message;
    }
  }

  refreshFavorites() {
    this._favorites = new Set(getSiteFavorites(this.path));
  }

  async loadFavorites() {
    if (!this._files || this._favoriteFiles !== null) return;
    const request = this._request;
    this._favoriteFiles = undefined;
    this.refreshFavorites();
    const recentPaths = new Set(this._files.map(({ path }) => path));
    const paths = [...this._favorites].filter((path) => !recentPaths.has(path));
    try {
      const { source } = await getNx2Api();
      const files = await loadFilesByPath({ paths, source, signal: request.signal });
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
  }

  getFavoriteFiles() {
    const files = new Map([...this._files, ...(this._favoriteFiles ?? [])]
      .map((item) => [item.path, item]));
    return [...files.values()]
      .filter((item) => this._favorites.has(item.path))
      .sort((a, b) => (Number(b.lastModified) || 0) - (Number(a.lastModified) || 0)
        || a.name.localeCompare(b.name));
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
      return html`<div class="empty-state">${icon(this._tab === 'starred' ? 'star' : 'folder')}
        <h3>${this._tab === 'starred' ? 'No favorites yet' : 'No recent files yet'}</h3>
        <p>${this._tab === 'starred' ? 'Add a file in Browse to favorites to keep it close.' : 'Open a file to see it here.'}</p>
      </div>`;
    }
    return html`
      <div class="file-list" role="grid" aria-label=${this._tab === 'starred' ? 'Favorite files' : 'Recent files'}
        tabindex=${this._view === 'list' ? 0 : nothing}>
        <da-list .listItems=${getListItems({
      files: files.slice(0, this._tab === 'starred' ? PAGE_SIZE : this._limit),
      favorites: this._favorites,
      editor: this._editor || '/edit#',
      editorConfs: this._editorConfs,
    })} .view=${this._view}
          .showFolder=${true} .sort=${false}
          size=${this._view === 'card' ? 's' : 'm'}
          @favoritechange=${({ detail: { item } }) => this.starFile(item)}></da-list>
      </div>
      ${this._tab !== 'starred' && this._limit < MAX_FILES && files.length > this._limit
        ? html`<button class="show-more nx-action-btn-quiet" @click=${() => {
          this._limit = MAX_FILES;
        }}>Show more files</button>` : nothing}`;
  }

  render() {
    if (!this._scope) return nothing;
    return html`<div class="landing">
      <section class="files-panel" data-view=${this._view} aria-labelledby="files-heading">
        <div class="panel-heading">
          <h2 id="files-heading">Content</h2>
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
          <a class="all-files" href=${getBrowseHref({ path: this.path })}>Show all</a>
        </div>
        ${this._actionError ? html`<p role="alert">${this._actionError}</p>` : nothing}
        <div aria-busy=${this.loading}>${this.renderFiles()}</div>
      </section>
    </div>`;
  }
}

customElements.define('da-recent-files', DaRecentFiles);

export default function init(el, { scope } = {}) {
  const files = document.createElement('da-recent-files');
  files.setScope(scope);
  el.replaceChildren(files);
  return files;
}
