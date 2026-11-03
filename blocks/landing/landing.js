import { LitElement, html, nothing, repeat } from 'da-lit';
import { getNx, getNx2, getNx2Api, getNxEWFlags } from '../../scripts/utils.js';
import { getFavorites, toggleFavorite } from '../browse/shared/favorites.js';
import { getBrowseSettings, updateBrowseSettings } from '../browse/v2/shared/settings.js';
import { getBrowseHref, getFileHref, loadFiles } from './utils.js';
import '../shared/da-file-item/da-file-item.js';
import renderFileTable from './file-table.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);
const nx = await import(`${getNx2()}/scripts/nx.js`);
const sizing = nx.getUISize ? await import(`${getNx2()}/utils/ui-size.js`) : undefined;
await import(`${getNx()}/blocks/shared/segmented-btn/segmented.js`);
const styles = await Promise.all([
  loadStyle(`${getNx2()}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);

const VIEW_ITEMS = [
  { value: 'list', label: 'List view', icon: '/img/icons/s2-icon-viewlist-20-n.svg', iconOnly: true },
  { value: 'card', label: 'Grid view', icon: '/img/icons/s2-icon-viewgrid-20-n.svg', iconOnly: true },
];
const PAGE_SIZE = 6;
const MAX_FILES = 18;
const LIST_COLUMNS = ['name', 'folder', 'modified', 'modifiedBy', 'actions'];

function icon(name) {
  return html`<svg aria-hidden="true" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-${name}-20-n.svg#icon"></use></svg>`;
}

export class DaLanding extends LitElement {
  static properties = {
    _scope: { state: true },
    _files: { state: true },
    _error: { state: true },
    _actionError: { state: true },
    _favorites: { state: true },
    _tab: { state: true },
    _view: { state: true },
    _limit: { state: true },
    _cardLimit: { state: true },
    _editor: { state: true },
  };

  _sizing = sizing && new sizing.UISizeController(this);

  _onStorage = ({ key }) => {
    if (key === 'da-favorites' || key === null) this.refreshFavorites();
  };

  constructor() {
    super();
    this._tab = 'recent';
    this._view = getBrowseSettings().view === 'list' ? 'list' : 'card';
    this._limit = PAGE_SIZE;
    this._cardLimit = PAGE_SIZE;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = styles;
    this._unsubscribe = hashChange.subscribe((state) => this.setScope(state));
    window.addEventListener('storage', this._onStorage);
  }

  disconnectedCallback() {
    this._unsubscribe?.();
    this._request?.abort();
    window.removeEventListener('storage', this._onStorage);
    super.disconnectedCallback();
  }

  get path() {
    return this._scope ? `/${this._scope}` : '';
  }

  setScope(state) {
    const scope = state?.org && state?.site ? `${state.org}/${state.site}` : undefined;
    if (this._scope === scope && this._request && !this._request.signal.aborted) return;
    this._scope = scope;
    this._tab = 'recent';
    this._limit = PAGE_SIZE;
    this._cardLimit = PAGE_SIZE;
    this._actionError = undefined;
    this.refreshFavorites();
    this.loadSite();
  }

  async loadSite() {
    this._request?.abort();
    const request = new AbortController();
    this._request = request;
    this._files = undefined;
    this._error = undefined;
    this._editor = undefined;
    if (!this._scope) return;
    const [org, site] = this._scope.split('/');
    const editor = getNxEWFlags()
      .then(({ isEWEnabled }) => isEWEnabled({ org, site }))
      .then((enabled) => (enabled ? '/canvas#' : '/edit#'))
      .catch(() => '/edit#');
    try {
      const { source } = await getNx2Api();
      const { files } = await loadFiles({ path: this.path, source, signal: request.signal });
      const destination = await editor;
      if (!this.isConnected || request.signal.aborted) return;
      this._editor = destination;
      this._files = files;
    } catch (error) {
      if (!request.signal.aborted && this.isConnected) this._error = error.message;
    }
  }

  refreshFavorites() {
    this._favorites = new Set(getFavorites(this.path));
  }

  starFile(item) {
    const starred = toggleFavorite(this.path, item.path);
    this.refreshFavorites();
    this._actionError = this._favorites.has(item.path) !== starred
      ? 'Could not save your favorites. Check that browser storage is available.' : undefined;
  }

  changeTab(value) {
    this._tab = value;
    this._limit = PAGE_SIZE;
    this._cardLimit = PAGE_SIZE;
  }

  changeView({ detail: { value } }) {
    if (!['card', 'list'].includes(value)) return;
    this._view = value;
    updateBrowseSettings({ view: value });
  }

  visibleFiles() {
    const files = this._tab === 'starred'
      ? this._files.filter((item) => this._favorites.has(item.path)) : this._files;
    if (this._view === 'card') {
      return files.slice(0, this._tab === 'starred' ? PAGE_SIZE : Math.min(this._cardLimit, MAX_FILES));
    }
    return files.slice(0, this._tab === 'starred' ? PAGE_SIZE : Math.min(this._limit, MAX_FILES));
  }

  renderFile(item) {
    const editor = this._editor || '/edit#';
    return html`<li class="file">
      <da-file-item view="card" .name=${item.name} .path=${item.path} .ext=${item.ext}
        .date=${item.lastModified} .editor=${editor} .href=${getFileHref({ item, editor })}
        .isFavorited=${this._favorites?.has(item.path)}
        @favoritechange=${() => this.starFile(item)}></da-file-item>
    </li>`;
  }

  renderListFile(item) {
    const folder = item.path.slice(0, item.path.lastIndexOf('/'));
    const editor = this._editor || '/edit#';
    return html`<da-file-item class="file-row" role="row"
      .columns=${LIST_COLUMNS} .name=${item.name} .path=${item.path} .ext=${item.ext}
      .date=${item.lastModified} .editor=${editor} .href=${getFileHref({ item, editor })}
      .folder=${{ label: folder.slice(this.path.length) || '/', href: getBrowseHref({ path: folder }) }}
      .size=${this.getAttribute('data-ui-size') || 's'}
      .isFavorited=${this._favorites?.has(item.path)}
      @favoritechange=${() => this.starFile(item)}></da-file-item>`;
  }

  renderFiles() {
    if (!this._scope) {
      return html`<div class="empty-state">${icon('folder')}
        <h3>Choose a site to get started</h3>
        <p>Select a site in Browse to see its content.</p>
        <a class="nx-action-btn" href=${getBrowseHref({})}>Browse sites</a>
      </div>`;
    }
    if (this._error) {
      return html`<div class="empty-state"><p role="alert">${this._error}</p>
        <button class="nx-action-btn" @click=${this.loadSite}>Try again</button></div>`;
    }
    if (!this._files) return html`<p class="loading" role="status">Loading files...</p>`;
    const files = this._tab === 'starred'
      ? this._files.filter((item) => this._favorites.has(item.path)) : this._files;
    if (!files.length) {
      return html`<div class="empty-state">${icon(this._tab === 'starred' ? 'star' : 'folder')}
        <h3>${this._tab === 'starred' ? 'No favorites yet' : 'No files here yet'}</h3>
        <p>${this._tab === 'starred' ? 'Add a file in this folder to favorites to keep it close.' : 'Open Files to add content to this site.'}</p>
      </div>`;
    }
    const canShowMore = this._tab !== 'starred' && (this._view === 'card'
      ? this._cardLimit < MAX_FILES && files.length > this._cardLimit
      : this._limit < MAX_FILES && files.length > this._limit);
    return html`
      ${this._view === 'list' ? renderFileTable({
    files: this.visibleFiles(),
    label: this._tab === 'starred' ? 'Favorite files' : 'Recently modified files',
    renderRow: (item) => this.renderListFile(item),
  }) : html`<ul class="files" aria-label=${this._tab === 'starred' ? 'Favorite files' : 'Recently modified files'}>
        ${repeat(this.visibleFiles(), (item) => item.path, (item) => this.renderFile(item))}
      </ul>`}
      ${canShowMore ? html`<button class="show-more nx-action-btn-quiet" @click=${() => {
    if (this._view === 'card') this._cardLimit = MAX_FILES;
    else this._limit = MAX_FILES;
  }}>Show more files</button>` : nothing}`;
  }

  render() {
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
              title="Recently modified files in this site"
              @click=${() => this.changeTab('recent')}>${icon('history')}Recent</button>
            <button class="filter" type="button" aria-pressed=${this._tab === 'starred'}
              @click=${() => this.changeTab('starred')}>${icon('star')}Favorite</button>
          </div>
          ${this._scope ? html`<a class="all-files" href=${getBrowseHref({ path: this.path })}>Show all</a>` : nothing}
        </div>
        ${this._actionError ? html`<p role="alert">${this._actionError}</p>` : nothing}
        <div aria-busy=${!!this._scope && !this._files && !this._error}>${this.renderFiles()}</div>
      </section>
    </div>`;
  }
}

customElements.define('da-landing', DaLanding);

export default function init(el) {
  const landing = document.createElement('da-landing');
  el.append(landing);
  return landing;
}
