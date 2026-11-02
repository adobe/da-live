import { LitElement, html, nothing, repeat } from 'da-lit';
import { getNx, getNx2, getNx2Api, getNxEWFlags } from '../../scripts/utils.js';
import { getChatPanelContent, setChatPrompt, addChatContext } from '../shared/chat-panel.js';
import { getTypeLabel, isImageExt } from '../shared/icons.js';
import { getFavorites, toggleFavorite } from '../browse/shared/favorites.js';
import { getBrowseSettings, updateBrowseSettings } from '../browse/v2/shared/settings.js';
import { getBrowseHref, getFileHref, loadFiles, getLandingIconHref, formatModified } from './utils.js';
import { EMPTY_DOC } from '../shared/utils.js';
import '../browse/v2/da-card-preview/da-card-preview.js';
import '../shared/file-actions/file-actions.js';
import renderFileTable from '../shared/file-table.js';
import { DOC_TILES } from './constants.js';
import './tile.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);
const { registerPanelSection, PANEL_EVENT } = await import(`${getNx()}/utils/panel.js`);
const { ADOBE_AI_GUIDELINES_URL, MENU_OPTIONS } = await import(`${getNx()}/blocks/shared/chat/constants.js`);
const { ADD_MENU_ITEMS } = await import(`${getNx()}/blocks/chat/constants.js`);
const { createFileDropHandlers } = await import(`${getNx()}/blocks/shared/chat/dnd.js`);
const nx = await import(`${getNx2()}/scripts/nx.js`);
// PR #816 supplies live sizing; the opt-in page also works on the current shell.
const sizing = nx.getUISize ? await import(`${getNx2()}/utils/ui-size.js`) : undefined;
await Promise.all([
  import(`${getNx2()}/blocks/shared/card/card.js`),
  import(`${getNx()}/blocks/shared/segmented-btn/segmented.js`),
  import(`${getNx()}/blocks/shared/menu/menu.js`),
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

function icon(name) {
  return html`<svg aria-hidden="true" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-${name}-20-n.svg#icon"></use></svg>`;
}

export class DaLanding extends LitElement {
  static properties = {
    _scope: { state: true },
    _name: { state: true },
    _files: { state: true },
    _error: { state: true },
    _profileError: { state: true },
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
    _dragging: { state: true },
    _permissions: { state: true },
    _openingPage: { state: true },
    _createDialog: { state: true },
  };

  _sizing = sizing && new sizing.UISizeController(this);

  _dnd = createFileDropHandlers({
    onDragging: (dragging) => { this._dragging = dragging; },
    onFiles: (files) => this.addFiles(files),
  });

  _onStorage = ({ key }) => {
    if (key === 'da-favorites' || key === null) this.refreshFavorites();
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
    this._dragging = false;
    this._unsubscribe?.();
    this._request?.abort();
    this._openingPage = undefined;
    this._createDialog = undefined;
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

  updated() {
    if (!this._prompt) this.shadowRoot.querySelector('textarea')?.style.removeProperty('height');
  }

  showAddSite() {
    this.dispatchEvent(new CustomEvent('site-add', { bubbles: true, composed: true }));
  }

  async loadImsProfile() {
    const { loadIms } = await import(`${getNx()}/utils/ims.js`);
    return loadIms();
  }

  async loadProfile() {
    try {
      const profile = await this.loadImsProfile();
      if (this.isConnected) this._name = profile?.first_name || profile?.displayName?.split(' ')[0];
    } catch {
      if (this.isConnected) this._profileError = 'Your profile could not be loaded.';
    }
  }

  setScope(state) {
    const scope = state?.org && state?.site ? `${state.org}/${state.site}` : undefined;
    if (this._scope === scope && this._request && !this._request.signal.aborted) return;
    this._scope = scope;
    this._openingPage = undefined;
    this._createDialog = undefined;
    this._permissions = undefined;
    this._tab = 'recent';
    this._limit = PAGE_SIZE;
    this._prompt = '';
    this._chatEnabled = undefined;
    this._editor = undefined;
    this._chatError = undefined;
    this._handingOff = false;
    this._dragging = false;
    this._error = undefined;
    this._actionError = undefined;
    this.refreshFavorites();
    document.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { detail: { section: 'chat' } }));
    this.loadSite();
  }

  async loadSite() {
    this._request?.abort();
    const request = new AbortController();
    this._request = request;
    this._files = undefined;
    this._permissions = undefined;
    this._error = undefined;
    if (!this._scope) return;
    this.loadChatAvailability(request);
    try {
      const { source } = await getNx2Api();
      const { signal } = request;
      const { files, permissions } = await loadFiles({ path: this.path, source, signal });
      if (!this.isConnected || request.signal.aborted) return;
      this._files = files;
      this._permissions = permissions;
    } catch (error) {
      if (!request.signal.aborted && this.isConnected) this._error = error.message;
    }
  }

  _onBrowse() {
    document.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { detail: { section: 'chat' } }));
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
          if (!options || request.signal.aborted) return;
          try {
            const chat = aside.querySelector('nx-chat, nx-chat-ao');
            if (!chat) throw new Error('The assistant could not be opened.');
            await chat.updateComplete;
            if (request.signal.aborted || !this.isConnected) return;
            if (options.autoSend && chat.thinking && !chat.pendingPlanApproval) {
              throw new Error('The assistant is still responding. Try again when it finishes.');
            }
            if (options.text) await chat.setPrompt(options.text, { autoSend: options.autoSend });
            for (const item of options.attachments || []) await addChatContext(item);
            if (options.action) {
              if (!chat.openAddAction) throw new Error('This assistant cannot open the selected Add action.');
              await chat.openAddAction(options.action);
            }
            options.onReady?.();
          } catch (error) {
            if (!request.signal.aborted) this._chatError = error.message;
          } finally {
            if (!request.signal.aborted) this._handingOff = false;
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

  async submitPrompt(event) {
    event.preventDefault();
    await this.openAssistant({ text: this._prompt.trim(), autoSend: true });
  }

  async openAssistant({ text, action, attachments, autoSend }) {
    if (!this._chatEnabled || this._handingOff) return;
    if (!text && !action && !attachments?.length) return;
    this._handingOff = true;
    this._chatError = undefined;
    try {
      const scope = this._scope;
      const onReady = () => {
        if (this._scope !== scope) return;
        this._prompt = '';
        this._handingOff = false;
      };
      if (autoSend || action || attachments?.length) {
        document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail: { section: 'chat', options: { text, action, attachments, autoSend, onReady } } }));
      } else {
        await setChatPrompt(text, onReady);
      }
    } catch (error) {
      this._handingOff = false;
      this._chatError = `Could not open the assistant: ${error.message}`;
    }
  }

  selectAddAction({ detail: { id } }) {
    if (id === MENU_OPTIONS.FILES) {
      this.shadowRoot.querySelector('.landing-file-input').click();
      return undefined;
    }
    return this.openAssistant({ text: this._prompt.trim(), action: id });
  }

  async attachFiles({ target }) {
    try {
      await this.addFiles([...target.files]);
    } finally {
      target.value = '';
    }
  }

  handleFileDrag(event) {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return undefined;
    event.preventDefault();
    if (!this._chatEnabled || this._handingOff) {
      this._dragging = false;
      event.dataTransfer.dropEffect = 'none';
      return undefined;
    }
    const handlers = {
      dragenter: this._dnd.onDragEnter,
      dragleave: this._dnd.onDragLeave,
      dragover: this._dnd.onDragOver,
      drop: this._dnd.onDrop,
    };
    return handlers[event.type](event);
  }

  async addFiles(files) {
    if (!this._chatEnabled || this._handingOff) return;
    if (!files.length) return;
    const scope = this._scope;
    try {
      if (files.some((file) => !file.type?.startsWith('image/')
        && !['application/pdf', 'text/markdown'].includes(file.type)
        && !file.name?.endsWith('.md'))) {
        throw new Error('Use images, PDFs or Markdown files.');
      }
      const { buildAttachmentItems } = await import(`${getNx()}/blocks/shared/chat/files.js`);
      const attachments = await buildAttachmentItems(files);
      if (this._scope !== scope || !this.isConnected) return;
      if (attachments.length !== files.length) throw new Error('Some files could not be read or exceed the attachment limit.');
      await this.openAssistant({ text: this._prompt.trim(), attachments });
    } catch (error) {
      if (this._scope === scope && this.isConnected) {
        this._chatError = `Could not attach files: ${error.message}`;
      }
    }
  }

  updatePrompt({ target }) {
    this._prompt = target.value;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 240)}px`;
  }

  visibleFiles() {
    const files = this._tab === 'starred'
      ? this._files.filter((item) => this._favorites.has(item.path)) : this._files;
    return files.slice(0, this._tab === 'starred' ? PAGE_SIZE : this._limit);
  }

  renderFileActions(item) {
    if (!item.ext && this._view === 'list') return nothing;
    return html`<da-file-actions .path=${item.path} .name=${item.name}
      .ext=${item.ext} .view=${this._view} .isFavorited=${this._favorites?.has(item.path)}
      @favoritechange=${() => this.starFile(item)}></da-file-actions>`;
  }

  renderFile(item) {
    const modified = formatModified({ modified: item.lastModified });
    const iconHref = getLandingIconHref(item);
    const editor = this._editor || '/canvas#';
    return html`
      <li class="file">
        <nx-card>
          <a slot="preview" class="file-preview" href=${getFileHref({ item, editor })}
            tabindex="-1" aria-hidden="true">
            <da-card-preview .path=${item.path} .ext=${item.ext} .iconHref=${iconHref}
              .documentPreview=${item.ext === 'html'}></da-card-preview>
          </a>
          <a slot="title" class="file-link file-name" href=${getFileHref({ item, editor })}
            title=${item.ext === 'link' ? `Open ${item.name} in Files` : `${item.name} (${getTypeLabel(item.ext)})`}>
            <span class="file-type-icon" aria-hidden="true" style="--file-icon: url('${iconHref}')"></span>
            <span>${item.name}</span>
          </a>
          <span slot="actions">${this.renderFileActions(item)}</span>
          <p slot="metadata" class="file-date">${modified ? html`Modified at • <time datetime=${modified.date.toISOString()}>${modified.label}</time>` : 'Date unavailable'}</p>
          ${this._favorites?.has(item.path) ? html`<img slot="badge" class="file-favorite-badge"
            src=${new URL('./star-filled.svg', import.meta.url).href} width="20" height="20" alt="Favorite">` : nothing}
        </nx-card>
      </li>`;
  }

  renderListFile(item) {
    const modified = formatModified({ modified: item.lastModified });
    const folder = item.path.slice(0, item.path.lastIndexOf('/'));
    return html`<tr class="file-row">
      <td><a class="list-file-link" href=${getFileHref({ item, editor: this._editor || '/canvas#' })}>
        ${isImageExt(item.ext) ? html`<da-card-preview class="list-file-preview"
          .path=${item.path} .ext=${item.ext} .iconHref=${getLandingIconHref(item)}
          aria-hidden="true"></da-card-preview>` : html`<span class="file-type-icon" aria-hidden="true"
          style="--file-icon: url('${getLandingIconHref(item)}')"></span>`}
        <span>${item.name}</span>
      </a></td>
      <td><a class="file-folder" href=${getBrowseHref({ path: folder })} title=${folder}>${folder.slice(this.path.length) || '/'}</a></td>
      <td>${modified ? html`<time datetime=${modified.date.toISOString()}>${modified.label}</time>` : 'Date unavailable'}</td>
      <td>${this.renderFileActions(item)}</td>
    </tr>`;
  }

  renderFiles() {
    if (!this._scope) {
      return html`<div class="empty-state">${icon('folder')}
        <h3>Choose a site to get started</h3>
        <p>Select a site in the navigation, or add an existing site.</p>
        <button class="nx-action-btn" @click=${this.showAddSite}>Add site</button>
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
    return html`
      ${this._view === 'list' ? renderFileTable({
    files: this.visibleFiles(),
    label: this._tab === 'starred' ? 'Favorite files' : 'Recently modified files',
    renderRow: (item) => this.renderListFile(item),
  }) : html`
        <ul class="files" aria-label=${this._tab === 'starred' ? 'Favorite files' : 'Recently modified files'}>
          ${repeat(this.visibleFiles(), (item) => item.path, (item) => this.renderFile(item))}
        </ul>`}
      ${this._tab !== 'starred' && files.length > this._limit ? html`
        <button class="show-more nx-action-btn-quiet" @click=${() => { this._limit += PAGE_SIZE; }}>
          Show more files
        </button>` : nothing}`;
  }

  renderQuickLinks() {
    return html`<ul class="quick-links" aria-label="Quick links">
      <li><da-landing-tile heading="Browse Content"
        description="View your recent, favorite, or other content by their organization"
        iconHref="/img/icons/s2-icon-folderopen-20-n.svg" .size=${this.uiSize}
        actionId="browse" @click=${this._onBrowse}
        .href=${this._scope ? getBrowseHref({ path: this.path, closeChat: true }) : undefined}></da-landing-tile></li>
      <li><da-landing-tile heading="Create a page" description="Create a new page in the selected site"
        iconHref="/img/icons/s2-icon-edit-20-n.svg" tone="green" .size=${this.uiSize}
        action actionId="create-page" .disabled=${!this._permissions?.includes('write') || !this._editor || !!this._openingPage}
        @click=${this._onCreatePage}></da-landing-tile></li>
      ${DOC_TILES.map((tile) => html`
        <li><da-landing-tile .heading=${tile.title} .description=${tile.description}
          .iconHref=${tile.iconHref} .tone=${tile.tone} .size=${this.uiSize}
          .actionId=${tile.id} .href=${tile.href}></da-landing-tile></li>`)}
    </ul>`;
  }

  render() {
    return html`
      <div class="landing">
        <section class="welcome" aria-labelledby="welcome-heading">
          <h1 id="welcome-heading">Hi${this._name ? html` ${this._name}` : nothing}, how can I help?</h1>
          <form class="composer ${this._dragging && this._chatEnabled && !this._handingOff ? 'is-dropzone' : ''}"
            @submit=${this.submitPrompt} @dragenter=${this.handleFileDrag}
            @dragleave=${this.handleFileDrag} @dragover=${this.handleFileDrag}
            @drop=${this.handleFileDrag}>
            <div class="composer-surface" aria-hidden="true"></div>
            <div class="composer-input">
              <span class="coworker-icon" aria-hidden="true"></span>
              <label class="sr-only" for="landing-prompt">Let me know your task</label>
              <textarea id="landing-prompt" rows="1" .value=${this._prompt}
                ?disabled=${!this._chatEnabled || this._handingOff} aria-describedby="assistant-note assistant-context"
                placeholder="Let me know your task — I can route you to the right app or tool"
                @input=${this.updatePrompt}></textarea>
            </div>
            <div class="composer-actions">
              <input class="landing-file-input" type="file" hidden multiple
                accept="image/*,application/pdf,text/markdown,.md"
                ?disabled=${!this._chatEnabled || this._handingOff} @change=${this.attachFiles}>
              <nx-menu .items=${ADD_MENU_ITEMS} placement="above" @select=${this.selectAddAction}>
                <button slot="trigger" type="button"
                  class="chat-add nx-action-btn-icon ${this.uiSize === 'm' ? 'nx-btn-lg' : ''}"
                  aria-label="Add" ?disabled=${!this._chatEnabled || this._handingOff}>
                  ${icon('add')}
                </button>
              </nx-menu>
              <button type="submit" class="composer-send nx-action-btn-icon is-active ${this.uiSize === 'm' ? 'nx-btn-lg' : ''}"
                aria-label=${this._handingOff ? 'Opening chat' : 'Send message'}
                title="Send message"
                ?disabled=${!this._chatEnabled || !this._prompt.trim() || this._handingOff}>${icon('arrowupsend')}</button>
            </div>
          </form>
          <p id="assistant-note" class="assistant-note">
            AI responses may be inaccurate.
            <a href=${ADOBE_AI_GUIDELINES_URL} target="_blank" rel="noopener noreferrer">AI User Guidelines</a>
          </p>
          <p id="assistant-context" class="sr-only">
            ${this._scope ? `Working in ${this._scope}. Send opens your site assistant and starts the conversation.` : 'Choose a site to use the assistant.'}
          </p>
          ${this._chatError || (this._scope && this._chatEnabled === false) ? html`
            <p class="assistant-note" role="status">${this._chatError || 'The assistant is not enabled for this site.'}</p>` : nothing}
          ${this._profileError ? html`<p class="assistant-note" role="status">${this._profileError}</p>` : nothing}
        </section>
        <section class="files-panel" aria-labelledby="files-heading">
          <div class="panel-heading">
            <h2 id="files-heading">Content</h2>
            <nx-segmented-btn label="File view" size="m" variant="quiet" .items=${VIEW_ITEMS}
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
  if (!document.adoptedStyleSheets.includes(shellStyle)) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, shellStyle];
  }
  const landing = document.createElement('da-landing');
  if (new URLSearchParams(window.location.search).get('theme') === 'light') {
    landing.dataset.theme = 'light';
  }
  el.replaceChildren(landing);
}
