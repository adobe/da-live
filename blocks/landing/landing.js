import { LitElement, html, nothing, repeat } from 'da-lit';
import { getNx, getNx2, getNx2Api, getNxEWFlags } from '../../scripts/utils.js';
import { getChatPanelContent, setChatPrompt } from '../shared/chat-panel.js';
import { iconPathForExt, getTypeLabel } from '../shared/icons.js';
import { getFavorites, toggleFavorite } from '../browse/shared/favorites.js';
import { getBrowseSettings, updateBrowseSettings } from '../browse/v2/shared/settings.js';
import { getSiteOptions, getBrowseHref, getFileHref, loadFiles } from './utils.js';
import '../browse/v2/da-card-preview/da-card-preview.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);
const { registerPanelSection, PANEL_EVENT } = await import(`${getNx()}/utils/panel.js`);
const nx = await import(`${getNx2()}/scripts/nx.js`);
// PR #816 supplies live sizing; the opt-in page also works on the current shell.
const sizing = nx.getUISize ? await import(`${getNx2()}/utils/ui-size.js`) : undefined;
await Promise.all([
  import(`${getNx()}/blocks/shared/picker/picker.js`),
  import(`${getNx()}/blocks/shared/segmented-btn/segmented.js`),
]);
const [shellStyle, ...styles] = await Promise.all([
  loadStyle(new URL('./shell.css', import.meta.url).href),
  loadStyle(`${getNx2()}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);

const VIEW_ITEMS = [
  { value: 'card', label: 'Grid view', icon: '/img/icons/s2-icon-viewgrid-20-n.svg', iconOnly: true },
  { value: 'list', label: 'List view', icon: '/img/icons/s2-icon-viewlist-20-n.svg', iconOnly: true },
];
const PAGE_SIZE = 10;
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function icon(name) {
  return html`<svg aria-hidden="true" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-${name}-20-n.svg#icon"></use></svg>`;
}

export class DaLanding extends LitElement {
  static properties = {
    _scope: { state: true },
    _sites: { state: true },
    _name: { state: true },
    _files: { state: true },
    _error: { state: true },
    _profileError: { state: true },
    _siteError: { state: true },
    _actionError: { state: true },
    _favorites: { state: true },
    _tab: { state: true },
    _view: { state: true },
    _limit: { state: true },
    _prompt: { state: true },
    _chatEnabled: { state: true },
    _editor: { state: true },
    _chatError: { state: true },
    _handingOff: { state: true },
  };

  _sizing = sizing && new sizing.UISizeController(this);

  _onStorage = ({ key }) => {
    if (key === 'da-favorites' || key === null) this.refreshFavorites();
    if (key === 'da-sites' || key === null) this.loadSites();
  };

  constructor() {
    super();
    this._tab = 'recent';
    this._view = getBrowseSettings().view === 'list' ? 'list' : 'card';
    this._limit = PAGE_SIZE;
    this._prompt = '';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = styles;
    this._unsubscribe = hashChange.subscribe((state) => this.setScope(state));
    window.addEventListener('storage', this._onStorage);
    this.loadProfile();
  }

  disconnectedCallback() {
    this._unsubscribe?.();
    this._request?.abort();
    window.removeEventListener('storage', this._onStorage);
    document.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { detail: { section: 'chat' } }));
    super.disconnectedCallback();
  }

  get uiSize() {
    return sizing?.getUISize() === 'm' ? 'm' : 's';
  }

  get path() {
    return this._scope ? `/${this._scope}` : '';
  }

  loadSites() {
    this._siteError = undefined;
    try {
      const recentSites = JSON.parse(localStorage.getItem('da-sites') || '[]');
      if (!Array.isArray(recentSites)) throw new TypeError('Recent sites must be a list.');
      this._sites = getSiteOptions({ recentSites, current: this._scope });
    } catch (error) {
      this._sites = getSiteOptions({ recentSites: [], current: this._scope });
      this._siteError = `Could not read recent sites: ${error.message}`;
    }
  }

  async loadProfile() {
    try {
      const { loadIms } = await import(`${getNx()}/utils/ims.js`);
      const profile = await loadIms();
      if (this.isConnected) this._name = profile?.first_name || profile?.displayName?.split(' ')[0];
    } catch {
      if (this.isConnected) this._profileError = 'Your profile could not be loaded.';
    }
  }

  setScope(state) {
    const scope = state?.org && state?.site ? `${state.org}/${state.site}` : undefined;
    if (this._scope === scope && this._sites && !this._request?.signal.aborted) return;
    this._scope = scope;
    this._tab = 'recent';
    this._limit = PAGE_SIZE;
    this._prompt = '';
    this._chatEnabled = undefined;
    this._editor = undefined;
    this._chatError = undefined;
    this._handingOff = false;
    this._error = undefined;
    this._actionError = undefined;
    this.loadSites();
    this.refreshFavorites();
    document.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { detail: { section: 'chat' } }));
    this.loadSite();
  }

  async loadSite() {
    this._request?.abort();
    const request = new AbortController();
    this._request = request;
    this._files = undefined;
    this._error = undefined;
    if (!this._scope) return;
    this.loadChatAvailability(request);
    try {
      const { source } = await getNx2Api();
      const files = await loadFiles({ path: this.path, source, signal: request.signal });
      if (this.isConnected && !request.signal.aborted) this._files = files;
    } catch (error) {
      if (!request.signal.aborted && this.isConnected) this._error = error.message;
    }
  }

  async loadChatAvailability(request) {
    const [org, site] = this._scope.split('/');
    try {
      const { isEWEnabled, isEwChatDisabled } = await getNxEWFlags();
      const [enabled, disabled] = await Promise.all([
        isEWEnabled({ org, site }), isEwChatDisabled({ org, site }),
      ]);
      if (request.signal.aborted || !this.isConnected) return;
      this._editor = enabled ? '/canvas#' : '/edit#';
      this._chatEnabled = enabled && !disabled;
      if (!this._chatEnabled) return;
      registerPanelSection('chat', {
        position: 'before',
        width: '400px',
        getContent: async () => {
          try {
            return await getChatPanelContent()();
          } catch (error) {
            this._chatError = `Could not open the assistant: ${error.message}`;
            this._handingOff = false;
            throw error;
          }
        },
        onShow: async (aside, id, options) => {
          if (!options?.text || request.signal.aborted) return;
          try {
            const chat = aside.querySelector('nx-chat, nx-chat-ao');
            if (!chat) throw new Error('The assistant could not be opened.');
            await chat.setPrompt(options.text);
            options.onReady?.();
          } catch (error) {
            this._chatError = error.message;
          } finally {
            this._handingOff = false;
          }
        },
      });
    } catch (error) {
      if (!request.signal.aborted && this.isConnected) {
        this._chatEnabled = false;
        this._chatError = `Could not load the assistant: ${error.message}`;
      }
    }
  }

  refreshFavorites() {
    this._favorites = new Set(getFavorites(this.path));
  }

  starFile(item) {
    const starred = toggleFavorite(this.path, item.path);
    this.refreshFavorites();
    this._actionError = this._favorites.has(item.path) !== starred
      ? 'Could not save your starred files. Check that browser storage is available.' : undefined;
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

  async submitPrompt(event) {
    event.preventDefault();
    const text = this._prompt.trim();
    if (!text || !this._chatEnabled || this._handingOff) return;
    this._handingOff = true;
    this._chatError = undefined;
    try {
      const scope = this._scope;
      await setChatPrompt(text, () => {
        if (this._scope !== scope) return;
        this._prompt = '';
        this._handingOff = false;
      });
    } catch (error) {
      this._handingOff = false;
      this._chatError = `Could not open the assistant: ${error.message}`;
    }
  }

  renderFile(item) {
    const starred = this._favorites?.has(item.path);
    const modified = Number(item.lastModified);
    const date = modified > 0 && !Number.isNaN(new Date(modified).getTime())
      ? new Date(modified) : undefined;
    const editor = this._editor || '/canvas#';
    return html`
      <li class="file">
        <a class="file-link" href=${getFileHref({ item, editor })} title=${item.ext === 'link' ? `Open ${item.name} in Files` : item.name}>
          <div class="file-preview">
            <da-card-preview .path=${item.path} .ext=${item.ext}></da-card-preview>
          </div>
          <div class="file-details">
            <div class="file-name">
              <svg aria-hidden="true" viewBox="0 0 20 20"><use href="${iconPathForExt(item.ext)}#icon"></use></svg>
              <span>${item.name}</span>
            </div>
            <p class="file-date">${getTypeLabel(item.ext)}${date ? html` &middot; <time datetime=${date.toISOString()}>${dateFormat.format(date)}</time>` : nothing}</p>
          </div>
        </a>
        <button class="file-star nx-action-btn-icon nx-btn-sm" type="button"
          aria-label="${starred ? 'Unstar' : 'Star'} ${item.name}" aria-pressed=${starred}
          @click=${() => this.starFile(item)}>${icon(starred ? 'starfilled' : 'star')}</button>
      </li>`;
  }

  renderFiles() {
    if (!this._scope) {
      return html`<div class="empty-state">${icon('folder')}
        <h3>Choose a site to get started</h3>
        <p>Select a recent site above, or find one in <a href=${getBrowseHref({})}>Browse sites</a>.</p>
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
        <h3>${this._tab === 'starred' ? 'No starred files yet' : 'No files here yet'}</h3>
        <p>${this._tab === 'starred' ? 'Star a file in this folder to keep it close.' : 'Open Files to add content to this site.'}</p>
      </div>`;
    }
    return html`
      <ul class="files ${this._view === 'list' ? 'list-view' : ''}" aria-label=${this._tab === 'starred' ? 'Starred files' : 'Recently modified files'}>
        ${repeat(files.slice(0, this._limit), (item) => item.path, (item) => this.renderFile(item))}
      </ul>
      ${files.length > this._limit ? html`
        <button class="show-more nx-action-btn-quiet" @click=${() => { this._limit += PAGE_SIZE; }}>
          Show more files
        </button>` : nothing}`;
  }

  render() {
    return html`
      <div class="landing">
        <div class="site-bar">
          <span class="eyebrow">Your workspace</span>
          ${this._sites?.length ? html`
            <nx-picker .items=${this._sites} .value=${this._scope ?? ''} size=${this.uiSize}
              label="Choose a site" aria-label="Workspace site"
              @change=${({ detail: { value } }) => { window.location.hash = `#/${value}`; }}></nx-picker>
          ` : html`<a href=${getBrowseHref({})}>Browse sites</a>`}
        </div>
        ${this._siteError ? html`<p role="status">${this._siteError}</p>` : nothing}
        <section class="welcome" aria-labelledby="welcome-heading">
          <h1 id="welcome-heading">Hi${this._name ? html` ${this._name}` : nothing}, how can I help?</h1>
          <form class="composer" @submit=${this.submitPrompt}>
            <label class="sr-only" for="landing-prompt">What would you like to work on?</label>
            <textarea id="landing-prompt" rows="2" .value=${this._prompt}
              ?disabled=${!this._chatEnabled || this._handingOff} aria-describedby="assistant-note"
              placeholder="What would you like to work on?"
              @input=${({ target }) => { this._prompt = target.value; }}></textarea>
            <div class="composer-actions">
              <span>${this._scope ? `Working in ${this._scope}` : 'Choose a site to use the assistant'}</span>
              <button type="submit" class="nx-btn-accent ${this.uiSize === 'm' ? 'nx-btn-lg' : ''}"
                ?disabled=${!this._chatEnabled || !this._prompt.trim() || this._handingOff}>
                ${this._handingOff ? 'Opening...' : 'Continue in chat'}${icon('arrowupsend')}
              </button>
            </div>
          </form>
          <p id="assistant-note" class="assistant-note" role="status">
            ${this._chatError || (this._scope && this._chatEnabled === false
            ? 'The assistant is not enabled for this site.'
            : 'Continue in your site assistant. Review your prompt before sending.')}
          </p>
          ${this._profileError ? html`<p class="assistant-note" role="status">${this._profileError}</p>` : nothing}
        </section>
        <section class="files-panel" aria-labelledby="files-heading">
          <div class="panel-heading">
            <div><h2 id="files-heading">Files</h2><p class="scope-label">Site root${this._scope ? ` / ${this._scope}` : ''}</p></div>
            <nx-segmented-btn label="File view" size=${this.uiSize} .items=${VIEW_ITEMS}
              .value=${this._view} @change=${this.changeView}></nx-segmented-btn>
          </div>
          <div class="files-toolbar">
            <div class="file-filters" role="group" aria-label="Filter files">
              <button class="filter" type="button" aria-pressed=${this._tab === 'recent'}
                @click=${() => this.changeTab('recent')}>${icon('history')}Recently modified</button>
              <button class="filter" type="button" aria-pressed=${this._tab === 'starred'}
                @click=${() => this.changeTab('starred')}>${icon('star')}Starred</button>
            </div>
            ${this._scope ? html`<a class="all-files" href=${getBrowseHref({ path: this.path })}>Show all files</a>` : nothing}
          </div>
          ${this._actionError ? html`<p role="alert">${this._actionError}</p>` : nothing}
          <div aria-busy=${!!this._scope && !this._files && !this._error}>${this.renderFiles()}</div>
        </section>
      </div>`;
  }
}

customElements.define('da-landing', DaLanding);

export default function init(el) {
  if (!document.adoptedStyleSheets.includes(shellStyle)) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, shellStyle];
  }
  el.replaceChildren(document.createElement('da-landing'));
}
