import { LitElement, html, nothing } from 'da-lit';
import { getFirstSheet, fetchDaConfigs } from '../../../shared/utils.js';
import { getNx, sanitizePathParts, getNxEWFlags } from '../../../../scripts/utils.js';
import { getChatPanelContent } from '../../../shared/chat-panel.js';
import { getBrowseSettings, updateBrowseSettings } from '../shared/settings.js';

// Components
import '../../da-new/da-new.js';
import '../da-list/da-list.js';
import '../da-browse-header/da-browse-header.js';
import { toggleToolsPanel, closeToolsPanel, registerToolsPanel, watchToolsPanel } from '../search/panel.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { CHAT_EVENT } = await import(`${getNx()}/utils/chat.js`);
const { PANEL_EVENT, wasPanelOpen, registerPanelSection } = await import(`${getNx()}/utils/panel.js`);

const SORT_PROPS = ['name', 'lastModified'];
const SORT_DIRECTIONS = ['ascending', 'descending'];

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
    _sortPreference: { state: true },
    _groupByType: { state: true },
    _view: { state: true },
    _permissions: { state: true },
    _search: { state: true },
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
    this._search = { matchCase: true };
    const { groupByType, view, sort } = getBrowseSettings();
    this._sortPreference = SORT_PROPS.includes(sort?.property)
      && SORT_DIRECTIONS.includes(sort?.direction) ? sort : undefined;
    this._groupByType = groupByType === true;
    this._view = view === 'card' ? 'card' : 'list';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._handleShortcuts = this.handleShortcuts.bind(this);
    document.addEventListener('keydown', this._handleShortcuts);
    this.mountSearch();
    this.observeHeader();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._handleShortcuts);
    this.destroySearch();
    this._headerResizeObserver?.disconnect();
    this._headerResizeObserver = undefined;
  }

  get canWrite() {
    return !!this._permissions?.includes('write');
  }

  updated() {
    this.observeHeader();
    this.syncSearch();
  }

  observeHeader() {
    if (!this.isConnected || this._headerResizeObserver) return;
    const header = this.shadowRoot.querySelector('da-browse-header');
    if (!header) return;
    this._headerResizeObserver = new ResizeObserver(([entry]) => {
      this.style.setProperty('--da-browse-header-height', `${entry.borderBoxSize[0].blockSize}px`);
    });
    this._headerResizeObserver.observe(header, { box: 'border-box' });
  }

  canHandleClipboardShortcut(e) {
    if (e.defaultPrevented) return false;
    const path = e.composedPath();
    const pageFocused = [document.body, document.documentElement].includes(path[0]);
    if (!path.includes(this) && !pageFocused) return false;

    const editingSelector = 'input:not([type="checkbox"]):not([type="radio"]), '
      + 'textarea, select, dialog, [role="dialog"]';
    return !path.some((node) => {
      if (!(node instanceof Element)) return false;
      return node.matches(editingSelector) || node.isContentEditable
        || !!node.getRootNode().getSelection?.()?.toString();
    });
  }

  handleShortcuts(e) {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey
      && ['c', 'x', 'v'].includes(e.key?.toLowerCase())) {
      if (this.canHandleClipboardShortcut(e)
        && this.activeListCmp?.actionBar?.handleShortcut(e.key)) e.preventDefault();
      return;
    }
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
        this.updateNavField();
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
    if (currentTarget !== this.activeListCmp) return;
    this._sortState = detail;
    const { property, direction, loading } = detail;
    if (!property || loading) return;
    const saved = this._sortPreference;
    if (saved?.property === property && saved?.direction === direction) return;
    this._sortPreference = { property, direction };
    updateBrowseSettings({ sort: this._sortPreference });
  }

  mountSearch() {
    this._unwatchTools = watchToolsPanel({
      getPanel: () => this._toolsPanel,
      onChange: (open) => {
        this._toolsOpen = open;
        if (!open) this._navField?.actionButton?.focus();
      },
    });
    registerToolsPanel({
      getPanel: () => this.getToolsPanel(),
      isConnected: () => this.isConnected,
      shouldShow: () => this._toolsOpen,
    });
    this._searchReady = this.mountNavField();
  }

  destroySearch() {
    this._unwatchTools?.();
    if (this._toolsPanel) {
      closeToolsPanel();
      this._toolsPanel.closest('aside.panel')?.remove();
      this._toolsPanel.remove();
    }
    this.clearSearch();
    this._navField?.remove();
  }

  async mountNavField() {
    const nav = document.querySelector('nx-nav');
    if (!nav) return;
    await import('../da-browse-search/da-browse-search.js');
    if (!this.isConnected) return;
    if (!this._navField) {
      const field = document.createElement('da-browse-search');
      field.getDirectory = async () => {
        await this.updateComplete;
        if (!this.browseCmp) throw new Error('Directory listing is not ready');
        return this.browseCmp.getDirectorySnapshot();
      };
      field.addEventListener('search-submit', (e) => this.submitSearch(e));
      field.addEventListener('input', () => this.setSearchDraft(field.value));
      field.addEventListener('toolstoggle', () => toggleToolsPanel(this._toolsOpen));
      this._navField = field;
    }
    nav.append(this._navField);
    this.updateNavField();
    this.syncSearch();
    this.getToolsPanel().catch(() => { });
  }

  updateNavField() {
    if (!this._navField) return;
    const { fullpath } = this.details ?? {};
    const directory = fullpath?.split('/').filter(Boolean).at(-1);
    const label = directory ? `Search ${directory}` : 'Search files';
    this._navField.label = label;
    this._navField.placeholder = label;
    this._navField.fullpath = fullpath;
    this._navField.setAttribute('aria-label', label);
  }

  setSearchDraft(value) {
    if (this._search.replacement?.loading) return;
    if (!value) {
      this.clearSearch();
      return;
    }
    this._search = { ...this._search, draft: value, replacement: undefined };
    this.syncSearch();
  }

  clearSearch() {
    const wasSearching = !!this._searchEngine;
    this._searchRequest = undefined;
    this._searchEngine?.cancelSearch();
    this._searchEngine = undefined;
    this._search = { matchCase: this._search.matchCase, loading: false };
    if (this._navField) {
      this._navField.resetCatalog();
      this._navField.value = '';
    }
    this.syncSearch();
    if (wasSearching) {
      this.browseCmp?.notifySortState?.();
      this.browseCmp?.notifyTypesFilter?.();
    }
  }

  async submitSearch(event, { preserveDraft = false } = {}) {
    event.preventDefault();
    if (this._search.replacement?.loading) return;
    this._navField?.closeSuggestions();
    const term = event.detail.value.trim();
    const fullpath = this.details?.fullpath;
    if (!term || !fullpath) return;
    const request = {};
    this._searchRequest = request;
    this._searchEngine?.cancelSearch();
    this._search = {
      matchCase: this._search.matchCase,
      draft: preserveDraft ? this._search.draft ?? event.detail.value : event.detail.value,
      term,
      items: [],
      loading: true,
    };
    try {
      const { default: SearchEngine } = await import('../search/search.js');
      if (this._searchRequest !== request || !this.isConnected) return;
      const engine = new SearchEngine();
      engine.fullpath = fullpath;
      engine.browseItems = this.browseCmp?.items?.map((item) => ({ ...item }));
      engine.caseSensitive = this._search.matchCase;
      engine.addEventListener('updated', ({ detail }) => {
        if (this._searchEngine === engine && this._searchRequest === request) {
          this._search = { ...this._search, items: detail.items };
        }
      });
      this._searchEngine = engine;
      await this.updateComplete;
      if (this._searchRequest !== request || !this.isConnected) return;
      await engine.search(fullpath, term);
    } catch (error) {
      if (this._searchRequest === request) {
        this._search = { ...this._search, error: `Search failed: ${error.message}` };
      }
    } finally {
      if (this._searchRequest === request) {
        this._search = { ...this._search, loading: false };
      }
    }
  }

  async getToolsPanel() {
    this._toolsPanelReady ??= import('../da-browse-tools/da-browse-tools.js').then(() => {
      const panel = document.createElement('da-browse-tools');
      panel.addEventListener('findchange', ({ detail }) => this.setSearchDraft(detail.value));
      panel.addEventListener('search-submit', (e) => this.submitSearch(e));
      panel.addEventListener('matchcasechange', (e) => this.changeMatchCase(e));
      panel.addEventListener('replacerequest', (e) => this.replaceMatches(e));
      this._toolsPanel = panel;
      this.syncSearch();
      return panel;
    }).catch((error) => {
      this._toolsPanelReady = undefined;
      this._toolsOpen = false;
      this._search = { ...this._search, error: `Search options failed: ${error.message}` };
      throw error;
    });
    return this._toolsPanelReady;
  }

  syncSearch() {
    const search = this._search;
    const field = this._navField;
    if (field) {
      field.disabled = !!search.replacement?.loading;
      field.matchCase = search.matchCase;
      field.editor = this.editor;
      field.toolsOpen = this._toolsOpen;
      const value = search.draft ?? search.term ?? '';
      if (field.value !== value) field.value = value;
    }
    if (!this._toolsPanel) return;
    this._toolsPanel.searchState = {
      ...search,
      request: this._searchRequest,
      scope: this.details?.fullpath,
      count: search.items?.length ?? 0,
      canWrite: this.canWrite,
    };
  }

  async changeMatchCase({ detail: { matchCase } }) {
    if (this._search.replacement?.loading || this._search.matchCase === matchCase) return;
    this._search = { ...this._search, matchCase };
    if (this._search.term) {
      await this.submitSearch(
        new CustomEvent('search-submit', { detail: { value: this._search.term } }),
        { preserveDraft: true },
      );
    }
  }

  async replaceMatches({ detail: { replacement } }) {
    const engine = this._searchEngine;
    const {
      loading,
      error: searchError,
      replacement: previous,
      term,
      draft,
    } = this._search;
    if (!engine || !term || (draft ?? term).trim() !== term
      || loading || previous?.loading
      || searchError || !this.canWrite) return;
    this._search = { ...this._search, replacement: { loading: true } };
    try {
      const result = await engine.replaceMatches({ replacement });
      if (this._searchEngine !== engine || !this.isConnected) return;
      if (result.cancelled) {
        this._search = { ...this._search, replacement: { error: 'Replacement cancelled.' } };
      } else {
        // Results are stale once replaced; reset the search but keep the outcome visible.
        this.clearSearch();
        this._search = { ...this._search, replacement: result };
        this.syncSearch();
      }
    } catch (error) {
      if (this._searchEngine === engine && this.isConnected) {
        this._search = {
          ...this._search,
          replacement: { error: `Replacement failed: ${error.message}` },
        };
      }
    }
  }

  renderSearchResults() {
    return html`
      <div role="grid" aria-label="Search results">
        <da-list class="da-list-type-search"
          editor=${this.editor}
          .listItems=${this._search.items}
          .hidePublishConfs=${this.hidePublishConfs}
          .groupByType=${this._groupByType}
          .view=${this._view}
          @typesfilterchange=${this.handleTypesFilterChange}
          @sortchange=${this.handleSortChange}
          .sortPreference=${this._sortPreference}
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
        .groupByType=${this._groupByType}
        .sortPreference=${this._sortPreference}
        .view=${this._view}></da-list>`;
  }

  setView(view) {
    this._view = view === 'card' ? 'card' : 'list';
    updateBrowseSettings({ view: this._view });
  }

  setGroupByType(group) {
    this._groupByType = group;
    updateBrowseSettings({ groupByType: group });
  }

  render() {
    const search = this._search;
    return html`
      <da-browse-header exportparts="chat-btn"
        .details=${this.details}
        .chatEnabled=${this._chatEnabled}
        .groupByType=${this._groupByType}
        .view=${this._view}
        .typesFilterState=${this._typesFilterState}
        .sortState=${this._sortState}
        .searchState=${this._searchEngine || search.loading || search.error ? {
          loading: search.loading,
          count: search.items?.length ?? 0,
          error: search.error,
        } : undefined}
        @typesfilterrequest=${({ detail }) => this.activeListCmp.toggleTypesPopover(detail.anchor)}
        @sortrequest=${({ detail }) => this.activeListCmp.setSort(detail.property, detail.direction)}
        @viewchange=${({ detail }) => this.setView(detail.view)}
        @groupbytypechange=${({ detail }) => this.setGroupByType(detail.group)}>
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
