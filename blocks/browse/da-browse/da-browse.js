import { LitElement, html, nothing } from 'da-lit';
import { getFirstSheet, fetchDaConfigs } from '../../shared/utils.js';
import { getNx, sanitizePathParts, getNxEWFlags } from '../../../scripts/utils.js';
import getEditPath from '../shared.js';

// Components
import '../da-new/da-new.js';
import '../da-search/da-search.js';
import '../da-list/da-list.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
await import(`${getNx()}/blocks/shared/breadcrumb/breadcrumb.js`);
const { getPanelStore, openPanel } = await import(`${getNx()}/utils/panel.js`);
const BROWSE_CHAT_SESSION_KEY = 'nx-browse-chat-open';

function isBrowseChatOpen() {
  try {
    return !!sessionStorage.getItem(BROWSE_CHAT_SESSION_KEY);
  } catch {
    return false;
  }
}

const style = await loadStyle(import.meta.url);

async function openChatPanel() {
  const store = getPanelStore();
  const width = store.before?.width ?? '400px';
  const aside = await openPanel({
    position: 'before',
    width,
    getContent: async () => {
      await import(`${getNx()}/blocks/chat/chat.js`);
      return document.createElement('nx-chat');
    },
  });
  if (aside) {
    try { sessionStorage.setItem(BROWSE_CHAT_SESSION_KEY, '1'); } catch (e) { /* ignore */ }
    aside.addEventListener('nx-panel-close', () => {
      try { sessionStorage.removeItem(BROWSE_CHAT_SESSION_KEY); } catch (e) { /* ignore */ }
    }, { once: true });
  }
  return aside;
}

export default class DaBrowse extends LitElement {
  static properties = {
    details: { attribute: false },
    _isSearchMode: { state: true },
    _searchStatus: { state: true },
    _chatEnabled: { state: true },
    _browseItems: { state: true },
  };

  _browseSelKeys = new Set();

  _clearBrowseSelection() {
    for (const key of this._browseSelKeys) {
      document.dispatchEvent(new CustomEvent('nx-add-to-chat', { detail: { key } }));
    }
    this._browseSelKeys = new Set();
  }

  _handleBrowseSelection = ({ detail: { items } }) => {
    const prevKeys = this._browseSelKeys;
    const nextKeys = new Set(items.map((i) => i.path));

    for (const key of prevKeys) {
      if (!nextKeys.has(key)) {
        document.dispatchEvent(new CustomEvent('nx-add-to-chat', { detail: { key } }));
      }
    }

    for (const item of items) {
      if (!prevKeys.has(item.path)) {
        document.dispatchEvent(new CustomEvent('nx-add-to-chat', {
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

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._handleShortcuts = this.handleShortcuts.bind(this);
    document.addEventListener('keydown', this._handleShortcuts);

    this._handleOpenChat = async ({ detail }) => {
      if (!this._chatEnabled) return;
      const aside = await openChatPanel();
      if (!detail?.text) return;
      aside?.querySelector('nx-chat')?.setPrompt(detail.text, { autoSend: detail.autoSend });
    };
    document.addEventListener('nx-open-chat-panel', this._handleOpenChat);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._handleShortcuts);
    document.removeEventListener('nx-open-chat-panel', this._handleOpenChat);
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

  handleBrowseListLoaded() {
    this._browseItems = this.browseListItems;
  }

  async update(props) {
    if (props.has('details') && this.details) {
      const prevDetails = props.get('details');
      const orgChanged = prevDetails?.org !== this.details.org;
      if (prevDetails?.fullpath !== this.details.fullpath) {
        this._clearBrowseSelection();
        this._isSearchMode = false;
        this._searchStatus = null;
      }

      // EW flag lives at site level — re-check whenever org or site changes,
      // and do this before getEditor so the default editor reflects EW state
      if (orgChanged || prevDetails?.site !== this.details.site) {
        const { org, site } = this.details;
        const { isEWEnabled } = await getNxEWFlags();
        this._chatEnabled = await isEWEnabled({ org, site });
        if (this._chatEnabled && isBrowseChatOpen()) {
          openChatPanel();
        }
      }

      // Only re-fetch editor configs if the org changes
      this.editor = await this.getEditor(orgChanged);
    }

    super.update(props);
  }

  async getEditor(reFetch) {
    const DEF_EDIT = this._chatEnabled ? '/canvas#' : '/edit#';

    if (reFetch) {
      const { org, site } = this.details;
      const configs = await Promise.all(fetchDaConfigs({ org, site }));
      const rows = configs.filter(Boolean).reverse().flatMap((c) => getFirstSheet(c) || []);
      this.editorConfs = rows.reduce((acc, row) => {
        if (row.key === 'editor.path') acc.push(row.value);
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
    const sorted = matchedConfs.sort((a, b) => b.split('=')[0].length - a.split('=')[0].length);
    return sorted[0].split('=')[1];
  }

  handleSearchStarted() {
    this._isSearchMode = true;
    this._searchStatus = null;
  }

  handleSearchCleared() {
    this._isSearchMode = false;
    this._searchStatus = null;
  }

  handleSearch(e) {
    this._searchStatus = e.detail.status ?? null;
    this.shadowRoot.querySelector('.da-list-type-search').listItems = e.detail.items;
  }

  handleNewItem(e) {
    this.shadowRoot.querySelector('.da-list-type-browse').newItem = e.detail.item;
  }

  handleSuggestionSelected(e) {
    const { item } = e.detail;
    if (!item.ext) {
      window.location.hash = item.path;
    } else {
      window.location = getEditPath({ path: item.path, ext: item.ext, editor: this.editor });
    }
  }

  get newCmp() {
    return this.shadowRoot.querySelector('da-new');
  }

  get browseListItems() {
    // eslint-disable-next-line no-underscore-dangle
    return this.shadowRoot.querySelector('.da-list-type-browse')?._listItems || [];
  }

  isRootFolder(path) {
    if (!path) return true;
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
    const hidden = this.isRootFolder(this.details?.fullpath);
    return html`
      <da-search
        ?inert=${hidden}
        style=${hidden ? 'visibility: hidden' : ''}
        @updated=${this.handleSearch}
        @search-started=${this.handleSearchStarted}
        @search-cleared=${this.handleSearchCleared}
        @suggestion-selected=${this.handleSuggestionSelected}
        fullpath="${this.details.fullpath}"
        .browseItems="${this._browseItems}">
      </da-search>`;
  }

  renderList(type, fullpath, select, sort, drag) {
    return html`
      <da-list
        class="da-list-type-${type}"
        fullpath="${fullpath}"
        editor="${this.editor}"
        @onpermissions=${this.handlePermissions}
        @listloaded=${type === 'browse' ? this.handleBrowseListLoaded : nothing}
        @selectionchanged=${type === 'browse' && this._chatEnabled ? this._handleBrowseSelection : nothing}
        select="${select ? true : nothing}"
        sort="${sort ? true : nothing}"
        drag="${drag ? true : nothing}"></da-list>`;
  }

  render() {
    return html`
      <div class="da-browse-header">
        ${this._chatEnabled ? html`
          <button type="button" part="chat-btn" class="chat-btn" aria-label="Open chat panel" @click=${openChatPanel}>
            <svg aria-hidden="true" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-splitleft-20-n.svg#icon"></use></svg>
          </button>` : nothing}
        ${this.renderSearch()}
      </div>
      <div class="da-browse-content">
        <div class="da-list-header">
          <div class="da-breadcrumb-action-area">
            <div class="da-breadcrumb-area">
              <nx-breadcrumb .pathSegments="${this.details.fullpath.split('/').filter(Boolean)}"></nx-breadcrumb>
              ${!this.details.path ? html`
                <a class="da-breadcrumb-config" href="/config#${this.details.fullpath}/" aria-label="Config">
                  <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-settings-20-n.svg#icon"></use></svg>
                </a>` : nothing}
            </div>
            <div class="da-list-header-action">
              ${this.renderNew()}
            </div>
          </div>
          ${this._isSearchMode ? html`<h3 class="da-browse-title">Search results</h3>` : nothing}
          ${this._searchStatus ? html`<p class="da-browse-search-status">${this._searchStatus}</p>` : nothing}
        </div>
        <div data-visible="${!this._isSearchMode}">
          ${this.renderList('browse', this.details.fullpath, true, true, true)}
        </div>
        <div data-visible="${this._isSearchMode}">
          ${this.renderList('search', null, false, false, false)}
        </div>
      </div>
    `;
  }
}

customElements.define('da-browse', DaBrowse);
