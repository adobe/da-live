import { LitElement, html, nothing } from 'da-lit';
import { getFirstSheet, fetchDaConfigs } from '../../shared/utils.js';
import { getNx, sanitizePathParts, getNxEWFlags } from '../../../scripts/utils.js';
import { getChatPanelContent } from '../../shared/chat-panel.js';
import { getBrowseSettings, updateBrowseSettings } from '../shared/settings.js';

// Components
import '../da-new/da-new.js';
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
    const { flattenFolders } = getBrowseSettings();
    this._flattenFolders = typeof flattenFolders === 'boolean' ? flattenFolders : true;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
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

  handleNewItem(e) {
    this.shadowRoot.querySelector('.da-list-type-browse').newItem = e.detail.item;
  }

  get newCmp() {
    return this.shadowRoot.querySelector('da-new');
  }

  get browseCmp() {
    return this.shadowRoot.querySelector('.da-list-type-browse');
  }

  renderList() {
    return html`
      <da-list
        class="da-list-type-browse"
        fullpath="${this.details.fullpath}"
        editor="${this.editor}"
        .hidePublishConfs=${this.hidePublishConfs}
        @onpermissions=${this.handlePermissions}
        @typesfilterchange=${({ detail }) => { this._typesFilterState = detail; }}
        @sortchange=${({ detail }) => { this._sortState = detail; }}
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
    return html`
      <da-browse-header exportparts="chat-btn"
        .details=${this.details}
        .chatEnabled=${this._chatEnabled}
        .flattenFolders=${this._flattenFolders}
        .typesFilterState=${this._typesFilterState}
        .sortState=${this._sortState}
        @chatrequest=${openChatPanel}
        @typesfilterrequest=${({ detail }) => this.browseCmp.toggleTypesPopover(detail.anchor)}
        @sortrequest=${({ detail }) => this.browseCmp.setSort(detail.property, detail.direction)}
        @flattenfolderschange=${({ detail }) => this.setFlattenFolders(detail.flatten)}>
        <da-new @newitem=${this.handleNewItem} fullpath="${this.details.fullpath}" editor="${this.editor}"></da-new>
      </da-browse-header>
      <div class="da-browse-content">
        <div role="grid" aria-label="Browse files">
          ${this.renderList()}
        </div>
      </div>
    `;
  }
}

customElements.define('da-browse', DaBrowse);
