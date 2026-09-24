import { LitElement, html, nothing } from 'da-lit';
import { getFirstSheet, fetchDaConfigs } from '../../shared/utils.js';
import { getNx, getNx2, sanitizePathParts, getNxEWFlags } from '../../../scripts/utils.js';
import { getChatPanelContent } from '../../shared/chat-panel.js';

// Components
import '../da-new/da-new.js';
import '../da-search/da-search.js';
import '../da-list/da-list.js';

await import(`${getNx2()}/blocks/shared/segmented-btn/segmented.js`);
await import(`${getNx2()}/blocks/shared/switch/switch.js`);
await import(`${getNx2()}/blocks/shared/popover/popover.js`);

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { CHAT_EVENT } = await import(`${getNx()}/utils/chat.js`);
const { PANEL_EVENT, wasPanelOpen, registerPanelSection } = await import(`${getNx()}/utils/panel.js`);

const [BUTTONS, style] = await Promise.all([
  loadStyle(`${getNx2()}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);

function openChatPanel() {
  document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail: { section: 'chat' } }));
}

function closeChatPanel() {
  document.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { detail: { section: 'chat' } }));
}

const FLATTEN_FOLDERS_KEY = 'da-browse-flatten-folders';

function getStoredFlattenFolders() {
  try {
    const stored = sessionStorage.getItem(FLATTEN_FOLDERS_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

function setStoredFlattenFolders(flatten) {
  try {
    sessionStorage.setItem(FLATTEN_FOLDERS_KEY, String(flatten));
  } catch {
    // sessionStorage may be unavailable (Safari private mode, quota, etc.)
  }
}

export default class DaBrowse extends LitElement {
  static properties = {
    details: { attribute: false },
    _tabItems: { state: true },
    _searchItems: { state: true },
    _ewEnabled: { state: true },
    _chatEnabled: { state: true },
    _viewLayout: { state: true },
    _viewRowSize: { state: true },
    _flattenFolders: { state: true },
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
    this._tabItems = [
      {
        id: 'browse',
        title: 'Browse',
        selected: true,
      },
      {
        id: 'search',
        title: 'Search',
        selected: false,
      },
    ];
    this._viewLayout = 'list';
    this._viewRowSize = 'm';
    this._flattenFolders = getStoredFlattenFolders();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [BUTTONS, style];
    this._handleShortcuts = this.handleShortcuts.bind(this);
    document.addEventListener('keydown', this._handleShortcuts);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._handleShortcuts);
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
    if (this.newCmp) this.newCmp.permissions = e.detail;
  }

  async update(props) {
    if (props.has('details') && this.details) {
      const prevDetails = props.get('details');
      const orgChanged = prevDetails?.org !== this.details.org;
      if (prevDetails?.fullpath !== this.details.fullpath) this._clearBrowseSelection();

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

  handleTabClick(idx) {
    this._tabItems = this._tabItems.map((tab, tidx) => ({ ...tab, selected: idx === tidx }));
  }

  handleSearch(e) {
    this.shadowRoot.querySelector('.da-list-type-search').listItems = e.detail.items;
  }

  handleNewItem(e) {
    this.shadowRoot.querySelector('.da-list-type-browse').newItem = e.detail.item;
  }

  get context() {
    return this._tabItems.find((tab) => tab.selected).id;
  }

  get newCmp() {
    return this.shadowRoot.querySelector('da-new');
  }

  get browseCmp() {
    return this.shadowRoot.querySelector('.da-list-type-browse');
  }

  toggleTypesFilter({ currentTarget }) {
    this.browseCmp?.toggleTypesPopover(currentTarget);
  }

  get browseListItems() {
    // eslint-disable-next-line no-underscore-dangle
    return this.browseCmp?._listItems || [];
  }

  isRootFolder(path) {
    return path.split('/').length <= 2;
  }

  renderNew() {
    return html`
      <da-new
        @newitem=${this.handleNewItem}
        fullpath="${this.details.fullpath}"
        editor="${this.editor}">
      </da-new>`;
  }

  renderSearch() {
    return html`
      <da-search
        @updated=${this.handleSearch}
        fullpath="${this.details.fullpath}"
        .browseItems="${this.browseListItems}">
      </da-search>`;
  }

  renderList(type, fullpath, select, sort, drag) {
    return html`
      <da-list
        class="da-list-type-${type}"
        fullpath="${fullpath}"
        editor="${this.editor}"
        .hidePublishConfs=${this.hidePublishConfs}
        @onpermissions=${this.handlePermissions}
        @selectionchanged=${type === 'browse' && this._chatEnabled ? this._handleBrowseSelection : nothing}
        select="${select ? true : nothing}"
        sort="${sort ? true : nothing}"
        drag="${drag ? true : nothing}"
        .flattenFolders=${this._flattenFolders}></da-list>`;
  }

  renderSettingsActions() {
    if (!this.details?.org) return nothing;

    const href = this.details.site
      ? `/config#/${this.details.org}/${this.details.site}/`
      : `/config#/${this.details.org}/`;

    return html`
      <a class="da-browse-settings-link nx-action-btn-icon" href="${href}" aria-label="Config" title="Config">
        <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-settings-20-n.svg#icon"></use></svg>
      </a>`;
  }

  get _viewOptionsPopover() {
    return this.shadowRoot.querySelector('.da-browse-view-options-popover');
  }

  toggleViewOptions({ currentTarget }) {
    const popover = this._viewOptionsPopover;
    if (popover.open) popover.close();
    else popover.show({ anchor: currentTarget });
  }

  setViewLayout(layout) {
    this._viewLayout = layout;
  }

  setViewRowSize(size) {
    this._viewRowSize = size;
  }

  setFlattenFolders(flatten) {
    this._flattenFolders = flatten;
    setStoredFlattenFolders(flatten);
  }

  renderViewOptionsMenu() {
    return html`
      <nx-popover class="da-browse-view-options-popover" role="dialog" aria-label="View Options">
        <div class="da-browse-view-options-row">
          <div class="da-browse-view-options-label">Layout</div>
          <nx-segmented-btn
            label="Layout options"
            .items=${[
        { value: 'list', icon: '/img/icons/s2-icon-listbulleted-20-n.svg', label: 'List view', iconOnly: true },
        { value: 'grid', icon: '/img/icons/s2-icon-viewgrid-20-n.svg', label: 'Grid view', iconOnly: true },
      ]}
            .value=${this._viewLayout}
            @change=${({ detail }) => this.setViewLayout(detail.value)}>
          </nx-segmented-btn>
        </div>
        <div class="da-browse-view-options-row">
          <div class="da-browse-view-options-label">Row size</div>
          <nx-segmented-btn
            label="Row size options"
            .items=${[
        { value: 's', label: 'S' },
        { value: 'm', label: 'M' },
        { value: 'l', label: 'L' },
      ]}
            .value=${this._viewRowSize}
            @change=${({ detail }) => this.setViewRowSize(detail.value)}>
          </nx-segmented-btn>
        </div>
        <div class="da-browse-view-options-row">
          <nx-switch
            label="Flatten folders"
            ?checked=${this._flattenFolders}
            @change=${({ detail }) => this.setFlattenFolders(detail.checked)}>
          </nx-switch>
        </div>
      </nx-popover>`;
  }

  renderToolbarLeading() {
    return html`
      <div class="da-browse-toolbar-actions">
        ${this._chatEnabled ? html`
          <button type="button" part="chat-btn" class="chat-btn nx-action-btn-icon" aria-label="Open chat panel" @click=${openChatPanel}>
            <svg aria-hidden="true" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-splitleft-20-n.svg#icon"></use></svg>
          </button>` : nothing}
        ${this.renderNew()}
      </div>`;
  }

  renderToolbarTrailing() {
    return html`
      <div class="da-browse-toolbar-controls" aria-label="Browse toolbar controls">
        <button type="button" class="da-browse-toolbar-control nx-action-btn-quiet" @click=${this.toggleViewOptions}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="3" y="4" width="8" height="5" rx="1"></rect>
            <rect x="13" y="5" width="4" height="1.75" rx="0.875"></rect>
            <circle cx="15" cy="14" r="3"></circle>
            <path d="M16.8 15.8l1.6 1.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
            <rect x="3" y="11" width="3" height="6" rx="1"></rect>
            <rect x="7.5" y="11" width="3.5" height="2" rx="1"></rect>
          </svg>
          <span>View Options</span>
        </button>
        <button type="button" class="da-browse-toolbar-control nx-action-btn-quiet" @click=${this.toggleTypesFilter}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-filter-20-n.svg#icon"></use></svg>
          <span>Show All types</span>
        </button>
        ${this.renderSettingsActions()}
        ${this.renderViewOptionsMenu()}
      </div>`;
  }

  render() {
    return html`
      <div class="da-browse-header">
        <div class="da-browse-toolbar">
          <div class="da-browse-toolbar-leading">
            ${this.renderToolbarLeading()}
          </div>
          <div class="da-browse-toolbar-trailing">
            ${this.renderToolbarTrailing()}
          </div>
        </div>
      </div>
      <div class="da-browse-content">
        <div class="da-tabpanel" role="grid">
          ${this.renderList('browse', this.details.fullpath, true, true, true)}
        </div>
      </div>
    `;
  }
}

customElements.define('da-browse', DaBrowse);
