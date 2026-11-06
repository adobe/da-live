import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2, getNx2Api, getNxEWFlags } from '../../scripts/utils.js';
import { fetchDaConfigs, getFirstSheet } from '../shared/utils.js';
import { getSiteFavorites, toggleFavorite } from '../browse/shared/favorites.js';
import { getBrowseSettings, updateBrowseSettings } from '../browse/v2/shared/settings.js';
import { getBrowseHref, getListItems, loadFiles } from './utils.js';
import '../browse/v2/da-list/da-list.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
await import(`${getNx()}/blocks/shared/segmented-btn/segmented.js`);
const background = await loadStyle(import.meta.url);
const styles = await Promise.all([
  loadStyle(`${getNx2()}/styles/buttons.css`),
  loadStyle(new URL('./landing-content.css', import.meta.url).href),
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
    _editor: { state: true },
    _editorConfs: { state: true },
    _hasSavedSites: { state: true },
    _addingSite: { state: true },
  };

  _onStorage = ({ key }) => {
    if (key === 'da-favorites' || key === null) this.refreshFavorites();
    if (key === 'da-sites' || key === null) this.refreshSites();
  };

  _onResume = () => {
    this.refreshFavorites();
    this.refreshSites();
  };

  _onSiteSelect = ({ detail: { value } }) => {
    this.refreshSites();
    const [org, site] = value.split('/');
    return this.setScope({ org, site });
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
    this.refreshSites();
    if (this._scope) this.loadSite();
    window.addEventListener('storage', this._onStorage);
    window.addEventListener('focus', this._onResume);
    window.addEventListener('pageshow', this._onResume);
    document.addEventListener('site-select', this._onSiteSelect);
    document.addEventListener('site-added', this._onSiteSelect);
  }

  disconnectedCallback() {
    this._closeAddSite();
    this._request?.abort();
    window.removeEventListener('storage', this._onStorage);
    window.removeEventListener('focus', this._onResume);
    window.removeEventListener('pageshow', this._onResume);
    document.removeEventListener('site-select', this._onSiteSelect);
    document.removeEventListener('site-added', this._onSiteSelect);
    super.disconnectedCallback();
  }

  get path() {
    return this._scope ? `/${this._scope}` : '';
  }

  async setScope(state) {
    const scope = state?.org && state?.site ? `${state.org}/${state.site}` : undefined;
    if (this._scope === scope && this._request && !this._request.signal.aborted) return;
    this._closeAddSite();
    this._scope = scope;
    this._tab = 'recent';
    this._limit = PAGE_SIZE;
    this._actionError = undefined;
    this.refreshFavorites();
    await this.loadSite();
  }

  async loadSite() {
    this._request?.abort();
    const request = new AbortController();
    this._request = request;
    this._files = undefined;
    this._error = undefined;
    this._editor = undefined;
    this._editorConfs = undefined;
    if (!this._scope) return;
    const [org, site] = this._scope.split('/');
    const editor = getNxEWFlags()
      .then(({ isEWEnabled }) => isEWEnabled({ org, site }))
      .then((enabled) => (enabled ? '/canvas#' : '/edit#'))
      .catch(() => '/edit#');
    try {
      const { source } = await getNx2Api();
      const [{ files }, configs, destination] = await Promise.all([
        loadFiles({ path: this.path, source, signal: request.signal }),
        Promise.all(fetchDaConfigs({ org, site })),
        editor,
      ]);
      if (!this.isConnected || request.signal.aborted) return;
      this._editor = destination;
      this._editorConfs = configs.filter(Boolean).reverse()
        .flatMap((config) => getFirstSheet(config) || [])
        .filter(({ key }) => key === 'editor.path')
        .map(({ value }) => value);
      this._files = files;
    } catch (error) {
      if (!request.signal.aborted && this.isConnected) this._error = error.message;
    }
  }

  refreshFavorites() {
    this._favorites = new Set(getSiteFavorites(this.path));
  }

  refreshSites() {
    try {
      const sites = JSON.parse(localStorage.getItem('da-sites') || '[]');
      this._hasSavedSites = Array.isArray(sites) && sites.some(
        (site) => typeof site === 'string' && /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(site),
      );
    } catch {
      this._hasSavedSites = false;
    }
  }

  _closeAddSite() {
    this._addDialog?.remove();
    this._addDialog = undefined;
  }

  async _onAddSite() {
    if (this._addingSite || this._addDialog) return;
    this._addingSite = true;
    this._actionError = undefined;
    try {
      await import(`${getNx2()}/blocks/siteselector/add-site.js`);
      if (!this.isConnected || this._scope || this._hasSavedSites) return;
      const dialog = document.createElement('nx-add-site');
      this._addDialog = dialog;
      dialog.addEventListener('close', () => {
        this._closeAddSite();
        this.shadowRoot.querySelector('.add-site')?.focus();
      });
      dialog.addEventListener('site-added', async (event) => {
        event.stopPropagation();
        await this._onSiteSelect(event);
        if (this.isConnected) this.shadowRoot.querySelector('.filter')?.focus();
      });
      document.body.append(dialog);
    } catch {
      this._closeAddSite();
      if (this.isConnected) this._actionError = 'Could not open Add site. Reload the page to try again.';
    } finally {
      this._addingSite = false;
    }
  }

  starFile(item) {
    const folder = item.path.slice(0, item.path.lastIndexOf('/'));
    const starred = toggleFavorite(folder, item.path, { starred: !this._favorites.has(item.path) });
    this.refreshFavorites();
    this._actionError = this._favorites.has(item.path) !== starred
      ? 'Could not save your favorites. Check that browser storage is available.' : undefined;
  }

  changeTab(value) {
    this._tab = value;
    this._limit = PAGE_SIZE;
  }

  changeView({ detail: { value } }) {
    if (!['card', 'list'].includes(value)) return;
    this._view = value;
    updateBrowseSettings({ view: value });
  }

  renderFiles() {
    if (!this._scope) {
      return html`<div class="empty-state">${icon('folder')}
        <h3>${this._hasSavedSites ? 'Choose a site to get started' : 'Add a site to get started'}</h3>
        ${this._hasSavedSites ? html`<p>Select a site from "Your recent sites" to see its content.</p>` : nothing}
        ${this._hasSavedSites ? nothing : html`
          <button type="button" class="add-site nx-btn-accent"
            ?disabled=${this._addingSite} @click=${this._onAddSite}>Add site ${icon('add')}</button>`}
      </div>`;
    }
    if (this._error) {
      return html`<div class="empty-state"><p role="alert">${this._error}</p>
        <button class="nx-action-btn" @click=${this.loadSite}>Try again</button></div>`;
    }
    if (!this._files) return html`<p class="loading" role="status"><span class="nx-loading-spinner" aria-hidden="true"></span>Loading files...</p>`;
    const files = this._tab === 'starred'
      ? this._files.filter((item) => this._favorites.has(item.path)) : this._files;
    if (!files.length) {
      return html`<div class="empty-state">${icon(this._tab === 'starred' ? 'star' : 'folder')}
        <h3>${this._tab === 'starred' ? 'No favorites yet' : 'No files here yet'}</h3>
        <p>${this._tab === 'starred' ? 'Add a file in Browse to favorites to keep it close.' : 'Open Files to add content to this site.'}</p>
      </div>`;
    }
    return html`
      <div class="file-list" role="grid" aria-label=${this._tab === 'starred' ? 'Favorite files' : 'Recently modified files'}
        tabindex=${this._view === 'list' ? 0 : nothing}>
        <da-list .listItems=${getListItems({
    files: files.slice(0, this._tab === 'starred' ? PAGE_SIZE : this._limit),
    favorites: this._favorites,
    editor: this._editor || '/edit#',
    editorConfs: this._editorConfs,
  })} .view=${this._view}
          .showFolder=${true} .sort=${false} .editor=${this._editor || '/edit#'}
          .editorConfs=${this._editorConfs} .defaultEditor=${this._editor || '/edit#'}
          size=${this._view === 'card' ? 's' : 'm'}
          @favoritechange=${({ detail: { item } }) => this.starFile(item)}></da-list>
      </div>
      ${this._tab !== 'starred' && this._limit < MAX_FILES && files.length > this._limit
    ? html`<button class="show-more nx-action-btn-quiet" @click=${() => {
      this._limit = MAX_FILES;
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
  if (!document.adoptedStyleSheets.includes(background)) {
    document.adoptedStyleSheets.push(background);
  }
  const landing = document.createElement('div');
  landing.className = 'landing';
  const theme = new URLSearchParams(window.location.search).get('theme');
  if (['light', 'dark'].includes(theme)) landing.dataset.theme = theme;
  const content = document.createElement('da-landing');
  landing.append(content);
  el.replaceChildren(landing);
  return content;
}
