import { LitElement, html, nothing, repeat } from 'da-lit';
import { getNx, getNx2, getNx2Api, getNxEWFlags } from '../../scripts/utils.js';
import { iconPathForExt, isImageExt } from '../shared/icons.js';
import { getFavorites, toggleFavorite } from '../browse/shared/favorites.js';
import { getBrowseSettings, updateBrowseSettings } from '../browse/v2/shared/settings.js';
import { getBrowseHref, getFileHref, loadFiles, formatModified } from './utils.js';
import '../shared/da-file-item/da-file-item.js';
import './file-preview.js';
import './file-actions.js';
import renderFileTable from './file-table.js';
import { EMPTY_DOC } from '../shared/utils.js';
import { DOC_TILES } from './constants.js';
import './tile.js';

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
const PAGE_SIZE = 10;
const CARD_PAGE_SIZE = 6;
const CARD_MAX = 18;

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
    _permissions: { state: true },
    _openingPage: { state: true },
    _createDialog: { state: true },
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
    this._cardLimit = CARD_PAGE_SIZE;
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
    this._openingPage = undefined;
    this._createDialog = undefined;
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
    this._permissions = undefined;
    this._openingPage = undefined;
    this._createDialog = undefined;
    this._tab = 'recent';
    this._limit = PAGE_SIZE;
    this._cardLimit = CARD_PAGE_SIZE;
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
    this._permissions = undefined;
    if (!this._scope) return;
    const [org, site] = this._scope.split('/');
    const editor = getNxEWFlags()
      .then(({ isEWEnabled }) => isEWEnabled({ org, site }))
      .then((enabled) => (enabled ? '/canvas#' : '/edit#'))
      .catch(() => '/edit#');
    try {
      const { source } = await getNx2Api();
      const result = await loadFiles({ path: this.path, source, signal: request.signal });
      const destination = await editor;
      if (!this.isConnected || request.signal.aborted) return;
      this._editor = destination;
      this._files = result.files;
      this._permissions = result.permissions;
    } catch (error) {
      if (!request.signal.aborted && this.isConnected) this._error = error.message;
    }
  }

  refreshFavorites() {
    this._favorites = new Set(getFavorites(this.path));
  }

  async _onCreatePage() {
    if (!this._scope || !this._permissions?.includes('write') || !this._editor || this._openingPage) return;
    const opening = {};
    this._openingPage = opening;
    try {
      await import('../shared/da-name-dialog/da-name-dialog.js');
      if (this.isConnected && this._openingPage === opening) {
        this._createDialog = { folder: this.path, editor: this._editor };
      }
    } catch (error) {
      if (this.isConnected && this._openingPage === opening) {
        this._actionError = `Could not open New page: ${error.message}`;
      }
    } finally {
      if (this._openingPage === opening) this._openingPage = undefined;
    }
  }

  _onCloseCreatePage() {
    this._createDialog = undefined;
  }

  async _onCreatePageSubmit({ detail: { name, openAfter } }) {
    if (!this._createDialog || this._createDialog.saving) return;
    const dialog = { ...this._createDialog, saving: true, error: undefined };
    this._createDialog = dialog;
    const path = `${dialog.folder}/${name}.html`;
    try {
      const { source } = await getNx2Api();
      const existing = await source.getMetadata(path);
      if (!this.isConnected || this._createDialog !== dialog) return;
      if (existing.ok) throw new Error('A page with this name already exists. Choose another name.');
      if (existing.status !== 404) throw new Error('Could not check the page name. Please try again.');
      const response = await source.save(path, { body: EMPTY_DOC });
      if (!this.isConnected || this._createDialog !== dialog) return;
      if (!response?.ok) throw new Error('Could not create the page. Check your permissions and try again.');
      this._onCloseCreatePage();
      if (openAfter) {
        window.location.href = getFileHref({ item: { path, ext: 'html' }, editor: dialog.editor });
      } else {
        await this.loadSite();
      }
    } catch (error) {
      if (this.isConnected && this._createDialog === dialog) {
        this._createDialog = { ...dialog, saving: false, error: error.message };
      }
    }
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
    this._cardLimit = CARD_PAGE_SIZE;
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
      return files.slice(0, this._tab === 'starred' ? CARD_PAGE_SIZE : Math.min(this._cardLimit, CARD_MAX));
    }
    return files.slice(0, this._tab === 'starred' ? PAGE_SIZE : this._limit);
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
    const modified = formatModified({ modified: item.lastModified });
    const folder = item.path.slice(0, item.path.lastIndexOf('/'));
    return html`<tr class="file-row">
      <td><a class="list-file-link" href=${getFileHref({ item, editor: this._editor || '/edit#' })}>
        ${isImageExt(item.ext) ? html`<da-landing-preview class="list-file-preview"
          .path=${item.path} .ext=${item.ext} aria-hidden="true"></da-landing-preview>`
    : html`<span class="file-type-icon" aria-hidden="true"
          style="--file-icon: url('${iconPathForExt(item.ext)}')"></span>`}
        <span>${item.name}</span>
      </a></td>
      <td><a class="file-folder" href=${getBrowseHref({ path: folder })} title=${folder}>${folder.slice(this.path.length) || '/'}</a></td>
      <td>${modified ? html`<time datetime=${modified.date.toISOString()}>${modified.label}</time>` : 'Date unavailable'}</td>
      <td>${item.ext ? html`<da-landing-file-actions .path=${item.path} .name=${item.name}
        .ext=${item.ext} .isFavorited=${this._favorites?.has(item.path)}
        @favoritechange=${() => this.starFile(item)}></da-landing-file-actions>` : nothing}</td>
    </tr>`;
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
      ? this._cardLimit < CARD_MAX && files.length > this._cardLimit
      : files.length > this._limit);
    return html`
      ${this._view === 'list' ? renderFileTable({
    files: this.visibleFiles(),
    label: this._tab === 'starred' ? 'Favorite files' : 'Recently modified files',
    renderRow: (item) => this.renderListFile(item),
  }) : html`<ul class="files" aria-label=${this._tab === 'starred' ? 'Favorite files' : 'Recently modified files'}>
        ${repeat(this.visibleFiles(), (item) => item.path, (item) => this.renderFile(item))}
      </ul>`}
      ${canShowMore ? html`<button class="show-more nx-action-btn-quiet" @click=${() => {
    if (this._view === 'card') this._cardLimit = CARD_MAX;
    else this._limit += PAGE_SIZE;
  }}>Show more files</button>` : nothing}`;
  }

  renderQuickLinks() {
    return html`<ul class="quick-links" aria-label="Quick links">
      <li><da-landing-tile heading="Browse Content"
        description="View your recent, favorite, or other content by their organization"
        iconHref="/img/icons/s2-icon-folderopen-20-n.svg" .size=${this.dataset.uiSize || 's'}
        actionId="browse"
        .href=${this._scope ? getBrowseHref({ path: this.path }) : undefined}></da-landing-tile></li>
      <li><da-landing-tile heading="Create a page" description="Create a new page in the selected site"
        iconHref="/img/icons/s2-icon-edit-20-n.svg" tone="green" .size=${this.dataset.uiSize || 's'}
        action actionId="create-page" .disabled=${!this._permissions?.includes('write') || !this._editor || !!this._openingPage}
        @click=${this._onCreatePage}></da-landing-tile></li>
      ${DOC_TILES.map((tile) => html`
        <li><da-landing-tile .heading=${tile.title} .description=${tile.description}
          .iconHref=${tile.iconHref} .tone=${tile.tone} .size=${this.dataset.uiSize || 's'}
          .actionId=${tile.id} .href=${tile.href}></da-landing-tile></li>`)}
    </ul>`;
  }

  render() {
    return html`<div class="landing">
      <section class="files-panel" aria-labelledby="files-heading">
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
      ${this.renderQuickLinks()}
      ${this._createDialog ? html`<da-name-dialog open
        dialog-title="New page in ${this._scope?.split('/')[1]}"
        name-placeholder="page name" show-create-and-open
        ?saving=${this._createDialog.saving} .error=${this._createDialog.error || ''}
        @da-name-submit=${this._onCreatePageSubmit}
        @close=${this._onCloseCreatePage}></da-name-dialog>` : nothing}
    </div>`;
  }
}

customElements.define('da-landing', DaLanding);

export default function init(el) {
  const landing = document.createElement('da-landing');
  el.append(landing);
  return landing;
}
