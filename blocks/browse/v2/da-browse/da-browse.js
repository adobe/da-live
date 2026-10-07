import { LitElement, html, nothing } from 'da-lit';
import { getFirstSheet, fetchDaConfigs } from '../../../shared/utils.js';
import { getNx, sanitizePathParts, getNxEWFlags } from '../../../../scripts/utils.js';
import { getChatPanelContent } from '../../../shared/chat-panel.js';
import { getBrowseSettings, updateBrowseSettings } from '../shared/settings.js';

// Components
import '../../da-new/da-new.js';
import '../da-list/da-list.js';
import '../da-browse-header/da-browse-header.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { CHAT_EVENT } = await import(`${getNx()}/utils/chat.js`);
const { PANEL_EVENT, wasPanelOpen, registerPanelSection } = await import(`${getNx()}/utils/panel.js`);

const style = await loadStyle(import.meta.url);

function openChatPanel() {
  document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail: { section: 'chat' } }));
}

function closeChatPanel() {
  document.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { detail: { section: 'chat' } }));
}

export default class DaBrowse extends LitElement {
  static properties = {
    details: { attribute: false },
    _ewEnabled: { state: true },
    _chatEnabled: { state: true },
    _typesFilterState: { state: true },
    _sortState: { state: true },
    _flattenFolders: { state: true },
    _searchState: { state: true },
    _permissions: { state: true },
    _toolsOpen: { state: true },
  };

  _browseSelKeys = new Set();

  _clearBrowseSelection() {
    for (const key of this._browseSelKeys) {
      document.dispatchEvent(new CustomEvent(CHAT_EVENT.ADD_TO_CHAT, { detail: { key } }));
    }
    this._browseSelKeys = new Set();
  }

  _handleBrowseSelection = ({ detail: { items } }) => {
    const prevKeys = this._browseSelKeys;
    const nextKeys = new Set(items.map((i) => i.path));

    for (const key of prevKeys) {
      if (!nextKeys.has(key)) {
        document.dispatchEvent(new CustomEvent(CHAT_EVENT.ADD_TO_CHAT, { detail: { key } }));
      }
    }

    for (const item of items) {
      if (!prevKeys.has(item.path)) {
        document.dispatchEvent(new CustomEvent(CHAT_EVENT.ADD_TO_CHAT, {
          detail: {
            key: item.path,
            id: item.path,
            type: item.ext ? 'file' : 'folder',
            label: item.name,
            blockName: item.name,
            innerText: `Selected repository path: ${item.path.replace(/^\//, '')}`,
          },
        }));
      }
    }

    this._browseSelKeys = nextKeys;
  };

  constructor() {
    super();
    this._typesFilterState = { open: false, hiddenCount: 0 };
    this._sortState = { property: null, direction: 'none', loading: false };
    this._searchState = { matchCase: true };
    const { flattenFolders } = getBrowseSettings();
    this._flattenFolders = typeof flattenFolders === 'boolean' ? flattenFolders : true;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._handleShortcuts = this.handleShortcuts.bind(this);
    document.addEventListener('keydown', this._handleShortcuts);
    document.addEventListener(PANEL_EVENT.OPEN, this.handleToolsPanel);
    document.addEventListener(PANEL_EVENT.CLOSE, this.handleToolsPanel);
    registerPanelSection('tools', {
      position: 'after',
      width: '360px',
      getContent: () => this.getSearchPanel(),
      onShow: async (aside) => {
        if (!this.isConnected) {
          aside.remove();
          return;
        }
        const panel = await this.getSearchPanel();
        if (!this.isConnected) {
          aside.remove();
          return;
        }
        const body = aside.querySelector('.panel-body');
        if (!body.contains(panel)) body.replaceChildren(panel);
        aside.id = 'da-browse-tools';
        aside.setAttribute('aria-label', 'Browse tools');
        if (!this._toolsOpen) {
          document.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { detail: { section: 'tools' } }));
          return;
        }
        await panel.updateComplete;
        panel.focus();
      },
    });
    this._navSearchReady = this.mountNavSearch();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._handleShortcuts);
    document.removeEventListener(PANEL_EVENT.OPEN, this.handleToolsPanel);
    document.removeEventListener(PANEL_EVENT.CLOSE, this.handleToolsPanel);
    if (this._searchPanel) {
      document.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { detail: { section: 'tools' } }));
      this._searchPanel.closest('aside.panel')?.remove();
      this._searchPanel.remove();
    }
    this.clearSearch();
    this._navSearch?.remove();
  }

  async mountNavSearch() {
    const nav = document.querySelector('nx-nav');
    if (!nav) return;
    await import(`${getNx()}/blocks/shared/search/search.js`);
    if (!this.isConnected) return;
    if (!this._navSearch) {
      const field = document.createElement('nx-search');
      field.slot = 'search';
      field.variant = 'field';
      field.size = 'm';
      field.setAttribute('role', 'search');
      field.addEventListener('search-submit', (event) => this.submitSearch(event));
      field.addEventListener('input', () => {
        this.setSearchDraft(field.value);
      });
      const action = document.createElement('button');
      action.slot = 'actions';
      action.type = 'button';
      action.title = 'Search options';
      action.setAttribute('aria-label', 'Search options');
      action.setAttribute('aria-controls', 'da-browse-tools');
      action.setAttribute('aria-expanded', 'false');
      action.innerHTML = `<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
        <use href="/img/icons/s2-icon-properties-20-n.svg#icon"></use>
      </svg>`;
      action.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail: { section: 'tools' } }));
      });
      field.append(action);
      this._searchAction = action;
      this._navSearch = field;
    }
    nav.append(this._navSearch);
    this.updateNavSearch();
    this.syncSearchPanel();
  }

  updateNavSearch() {
    if (!this._navSearch) return;
    const directory = this.details?.fullpath?.split('/').filter(Boolean).at(-1);
    const label = directory ? `Search ${directory}` : 'Search files';
    this._navSearch.label = label;
    this._navSearch.placeholder = label;
    this._navSearch.setAttribute('aria-label', label);
  }

  setSearchDraft(value) {
    if (this._searchState.replacement?.loading) return;
    this._searchPanel?.invalidateReplacement();
    if (!value) {
      this.clearSearch();
      return;
    }
    this._searchState = { ...this._searchState, draft: value, replacement: undefined };
    this.syncSearchPanel();
  }

  clearSearch() {
    this._searchPanel?.invalidateReplacement();
    const wasSearching = !!this._searchEngine;
    this._searchRequest = undefined;
    this._searchEngine?.cancelSearch();
    this._searchEngine = undefined;
    this._searchState = { matchCase: this._searchState.matchCase, loading: false };
    if (this._navSearch) this._navSearch.value = '';
    this.syncSearchPanel();
    if (wasSearching) {
      this.browseCmp?.notifySortState?.();
      this.browseCmp?.notifyTypesFilter?.();
    }
  }

  async submitSearch(event, { preserveDraft = false } = {}) {
    event.preventDefault();
    if (this._searchState.replacement?.loading) return;
    const term = event.detail.value.trim();
    const fullpath = this.details?.fullpath;
    if (!term || !fullpath) return;
    const request = {};
    this._searchRequest = request;
    this._searchEngine?.cancelSearch();
    this._searchState = {
      matchCase: this._searchState.matchCase,
      draft: preserveDraft ? this._searchState.draft ?? event.detail.value : event.detail.value,
      term,
      items: [],
      loading: true,
    };
    try {
      const { default: SearchEngine } = await import('../search/search.js');
      if (this._searchRequest !== request || !this.isConnected) return;
      const search = new SearchEngine();
      search.fullpath = fullpath;
      search.browseItems = this.browseCmp?.items?.map((item) => ({ ...item }));
      search.caseSensitive = this._searchState.matchCase;
      this._searchEngine?.cancelSearch();
      search.addEventListener('updated', ({ detail }) => {
        if (this._searchEngine === search && this._searchRequest === request) {
          this._searchState = { ...this._searchState, items: detail.items };
        }
      });
      this._searchEngine = search;
      this._searchState = { ...this._searchState, items: [] };
      await this.updateComplete;
      if (this._searchRequest !== request || !this.isConnected) return;
      await search.search(fullpath, term);
    } catch (error) {
      if (this._searchRequest === request) {
        this._searchState = { ...this._searchState, error: `Search failed: ${error.message}` };
      }
    } finally {
      if (this._searchRequest === request) {
        this._searchState = { ...this._searchState, loading: false };
      }
    }
  }

  handleToolsPanel = (event) => {
    const closingOwnPanel = event.type === PANEL_EVENT.CLOSE
      && this._searchPanel?.closest('aside.panel')?.contains(event.target);
    if (event.detail?.section !== 'tools' && !closingOwnPanel) return;
    this._toolsOpen = event.type === PANEL_EVENT.OPEN;
    if (!this._toolsOpen) this._searchAction?.focus();
  };

  async getSearchPanel() {
    this._searchPanelReady ??= import('../da-browse-tools/da-browse-tools.js').then(() => {
      const panel = document.createElement('da-browse-tools');
      panel.addEventListener('findchange', ({ detail }) => this.setSearchDraft(detail.value));
      panel.addEventListener('search-submit', (event) => this.submitSearch(event));
      panel.addEventListener('matchcasechange', (event) => this.changeMatchCase(event));
      panel.addEventListener('replacerequest', (event) => this.replaceSearchMatches(event));
      this._searchPanel = panel;
      this.syncSearchPanel();
      return panel;
    }).catch((error) => {
      this._searchPanelReady = undefined;
      this._toolsOpen = false;
      this._searchState = { ...this._searchState, error: `Search options failed: ${error.message}` };
      throw error;
    });
    return this._searchPanelReady;
  }

  syncSearchPanel() {
    const state = this._searchState;
    if (this._navSearch) {
      this._navSearch.disabled = !!state.replacement?.loading;
      const value = state.draft ?? state.term ?? '';
      if (this._navSearch.value !== value) this._navSearch.value = value;
    }
    this._searchAction?.setAttribute('aria-expanded', String(!!this._toolsOpen));
    if (!this._searchPanel) return;
    this._searchPanel.searchState = {
      ...state,
      request: this._searchRequest,
      scope: this.details?.fullpath,
      count: state.items?.length ?? 0,
      canWrite: !!this._permissions?.includes('write'),
    };
  }

  updated() {
    this.syncSearchPanel();
  }

  async changeMatchCase({ detail: { matchCase } }) {
    if (this._searchState.replacement?.loading || this._searchState.matchCase === matchCase) return;
    this._searchState = { ...this._searchState, matchCase };
    if (this._searchState.term) {
      await this.submitSearch(
        new CustomEvent('search-submit', { detail: { value: this._searchState.term } }),
        { preserveDraft: true },
      );
    }
  }

  async replaceSearchMatches({ detail: { replacement } }) {
    const search = this._searchEngine;
    const {
      loading,
      error: searchError,
      replacement: previousReplacement,
      term,
      draft,
    } = this._searchState;
    if (!search || !term || (draft ?? term).trim() !== term
      || loading || previousReplacement?.loading
      || searchError || !this._permissions?.includes('write')) return;
    this._searchState = { ...this._searchState, replacement: { loading: true } };
    try {
      const result = await search.replaceMatches({ replacement });
      if (this._searchEngine !== search || !this.isConnected) return;
      this._searchState = {
        ...this._searchState,
        replacement: result.cancelled ? { error: 'Replacement cancelled.' } : result,
      };
    } catch (error) {
      if (this._searchEngine === search && this.isConnected) {
        this._searchState = {
          ...this._searchState,
          replacement: { error: `Replacement failed: ${error.message}` },
        };
      }
    }
  }

  handleShortcuts(e) {
    // Check for Command / Control + Option + T
    if ((e.metaKey || e.ctrlKey) && e.altKey && e.code === 'KeyT') {
      e.preventDefault();
      const { fullpath } = this.details;
      const [...split] = sanitizePathParts(fullpath);
      if (split.length < 2) return;

      if (split[2] === '.trash') {
        split.splice(2, 1);
      } else {
        split.splice(2, 0, '.trash');
      }

      window.location.hash = `/${split.join('/')}`;
    }
  }

  handlePermissions(e) {
    this._permissions = e.detail;
    if (this.newCmp) this.newCmp.permissions = e.detail;
  }

  async update(props) {
    if (props.has('details') && this.details) {
      const prevDetails = props.get('details');
      const orgChanged = prevDetails?.org !== this.details.org;
      if (prevDetails?.fullpath !== this.details.fullpath) {
        this._permissions = undefined;
        this._clearBrowseSelection();
        this.clearSearch();
        this.updateNavSearch();
      }

      // EW flag lives at site level — re-check whenever org or site changes,
      // and do this before getEditor so the default editor reflects EW state
      if (orgChanged || prevDetails?.site !== this.details.site) {
        const { org, site } = this.details;
        const { isEWEnabled, isEwChatDisabled } = await getNxEWFlags();
        const [ewEnabled, chatDisabled] = await Promise.all([
          isEWEnabled({ org, site }),
          isEwChatDisabled({ org, site }),
        ]);
        this._ewEnabled = ewEnabled;
        this._chatEnabled = ewEnabled && !chatDisabled;
        if (this._chatEnabled) {
          registerPanelSection('chat', {
            position: 'before',
            width: '400px',
            getContent: getChatPanelContent(),
          });
          if (wasPanelOpen('chat')) openChatPanel();
        } else {
          closeChatPanel();
        }
      }

      // Only re-fetch editor configs if the org changes
      this.editor = await this.getEditor(orgChanged);
    }

    super.update(props);
  }

  async getEditor(reFetch) {
    const DEF_EDIT = this._ewEnabled ? '/canvas#' : '/edit#';

    if (reFetch) {
      const { org, site } = this.details;
      const configs = await Promise.all(fetchDaConfigs({ org, site }));
      const rows = configs.filter(Boolean).reverse().flatMap((c) => getFirstSheet(c) || []);
      this.editorConfs = rows.reduce((acc, row) => {
        if (row.key === 'editor.path') acc.push(row.value);
        return acc;
      }, []);
      this.hidePublishConfs = rows.reduce((acc, row) => {
        if (row.key === 'editor.hidePublish') acc.push(row.value);
        return acc;
      }, []);
    }

    if (!this.editorConfs || this.editorConfs.length === 0) return DEF_EDIT;

    // Filter down all matched confs
    const matchedConfs = this.editorConfs.filter(
      (conf) => this.details.fullpath.startsWith(conf.split('=')[0]),
    );

    if (matchedConfs.length === 0) return DEF_EDIT;

    // Sort by length in descending order (longest first)
    const matchedConf = matchedConfs.sort((a, b) => b.split('=')[0].length - a.split('=')[0].length)[0];

    return matchedConf.split('=')[1];
  }

  handleNewItem(e) {
    this.shadowRoot.querySelector('.da-list-type-browse').newItem = e.detail.item;
  }

  get newCmp() {
    return this.shadowRoot.querySelector('da-new');
  }

  get browseCmp() {
    return this.shadowRoot.querySelector('.da-list-type-browse');
  }

  get activeListCmp() {
    return this.shadowRoot.querySelector(this._searchEngine ? '.da-list-type-search' : '.da-list-type-browse');
  }

  handleTypesFilterChange({ currentTarget, detail }) {
    if (currentTarget === this.activeListCmp) this._typesFilterState = detail;
  }

  handleSortChange({ currentTarget, detail }) {
    if (currentTarget === this.activeListCmp) this._sortState = detail;
  }

  renderSearchResults() {
    return html`
      <div role="grid" aria-label="Search results">
        <da-list class="da-list-type-search"
          editor=${this.editor}
          .listItems=${this._searchState.items}
          .hidePublishConfs=${this.hidePublishConfs}
          .flattenFolders=${this._flattenFolders}
          @typesfilterchange=${this.handleTypesFilterChange}
          @sortchange=${this.handleSortChange}
          select sort></da-list>
      </div>`;
  }

  renderList() {
    return html`
      <da-list
        class="da-list-type-browse"
        fullpath="${this.details.fullpath}"
        editor="${this.editor}"
        .hidePublishConfs=${this.hidePublishConfs}
        @onpermissions=${this.handlePermissions}
        @typesfilterchange=${this.handleTypesFilterChange}
        @sortchange=${this.handleSortChange}
        @selectionchanged=${this._chatEnabled ? this._handleBrowseSelection : nothing}
        select
        sort
        drag
        .flattenFolders=${this._flattenFolders}></da-list>`;
  }

  setFlattenFolders(flatten) {
    this._flattenFolders = flatten;
    updateBrowseSettings({ flattenFolders: flatten });
  }

  render() {
    const search = this._searchState;
    return html`
      <da-browse-header exportparts="chat-btn"
        .details=${this.details}
        .chatEnabled=${this._chatEnabled}
        .flattenFolders=${this._flattenFolders}
        .typesFilterState=${this._typesFilterState}
        .sortState=${this._sortState}
        .searchState=${this._searchEngine || search.loading || search.error ? {
          loading: search.loading,
          count: search.items?.length ?? 0,
          error: search.error,
        } : undefined}
        @chatrequest=${openChatPanel}
        @typesfilterrequest=${({ detail }) => this.activeListCmp.toggleTypesPopover(detail.anchor)}
        @sortrequest=${({ detail }) => this.activeListCmp.setSort(detail.property, detail.direction)}
        @flattenfolderschange=${({ detail }) => this.setFlattenFolders(detail.flatten)}>
        <da-new variant="accent" @newitem=${this.handleNewItem} fullpath="${this.details.fullpath}" editor="${this.editor}"></da-new>
      </da-browse-header>
      <div class="da-browse-content">
        ${search.error ? html`<p role="alert">${search.error}</p>` : nothing}
        ${this._searchEngine ? this.renderSearchResults() : nothing}
        <div role="grid" aria-label="Browse files" ?hidden=${!!this._searchEngine}>
          ${this.renderList()}
        </div>
      </div>
    `;
  }
}

customElements.define('da-browse', DaBrowse);
