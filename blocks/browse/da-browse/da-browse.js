import { LitElement, html, nothing } from 'da-lit';
import { getFirstSheet, fetchDaConfigs } from '../../shared/utils.js';
import { getNx, sanitizePathParts, getNxEWFlags } from '../../../scripts/utils.js';

// Components
import '../da-breadcrumbs/da-breadcrumbs.js';
import '../da-new/da-new.js';
import '../da-search/da-search.js';
import '../da-list/da-list.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { getPanelStore, openPanel } = await import(`${getNx()}/utils/panel.js`);

const style = await loadStyle(import.meta.url);

async function openChatPanel() {
  const store = getPanelStore();
  const width = store.before?.width ?? '400px';
  return openPanel({
    position: 'before',
    width,
    getContent: async () => {
      await import(`${getNx()}/blocks/chat/chat.js`);
      return document.createElement('nx-chat');
    },
  });
}

export default class DaBrowse extends LitElement {
  static properties = {
    details: { attribute: false },
    _tabItems: { state: true },
    _searchItems: { state: true },
    _chatEnabled: { state: true },
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
  }

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

  async update(props) {
    if (props.has('details') && this.details) {
      const prevDetails = props.get('details');
      const orgChanged = prevDetails?.org !== this.details.org;

      // EW flag lives at site level — re-check whenever org or site changes,
      // and do this before getEditor so the default editor reflects EW state
      if (orgChanged || prevDetails?.site !== this.details.site) {
        const { org, site } = this.details;
        const { isEWEnabled } = await getNxEWFlags();
        this._chatEnabled = await isEWEnabled({ org, site });
        if (this._chatEnabled) {
          const store = getPanelStore();
          if (store.before && !store.before.fragment) openChatPanel();
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

  get browseListItems() {
    // eslint-disable-next-line no-underscore-dangle
    return this.shadowRoot.querySelector('.da-list-type-browse')?._listItems || [];
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
        @onpermissions=${this.handlePermissions}
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
      </div>
      <div class="da-browse-content">
        <div class="da-tablist" role="tablist" aria-label="Dark Alley content">
          ${this._tabItems.map((tab, idx) => {
      if (tab.id === 'search' && this.isRootFolder(this.details.fullpath)) {
        return nothing;
      }
      return html`
            <button
              id="tab-${tab.id}"
              type="button"
              role="tab"
              aria-selected="${tab.selected}"
              aria-controls="tabpanel-${tab.id}"
              @click=${() => { this.handleTabClick(idx); }}>
              <span class="focus">${tab.title}</span>
            </button>`;
    })}
      </div>
      <div class="da-list-header context-${this.context}">
        <da-breadcrumbs .details="${this.details}"></da-breadcrumbs>
        ${this._tabItems.map((tab) => html`
          <div class="da-list-header-action" data-visible="${tab.selected}">
            ${tab.id === 'browse' ? this.renderNew() : this.renderSearch()}
          </div>
        `)}
      </div>
      ${this._tabItems.map((tab) => html`
        <div class="da-tabpanel" id="tabpanel-${tab.id}" role="grid" aria-labelledby="tab-${tab.id}" data-visible="${tab.selected}">
          ${tab.id === 'browse' ? this.renderList(tab.id, this.details.fullpath, true, true, true) : this.renderList(tab.id, null, false, false, false)}
        </div>
      `)}
      </div>
    `;
  }
}

customElements.define('da-browse', DaBrowse);
