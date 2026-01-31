import { LitElement, html, nothing } from 'da-lit';
import { DA_ORIGIN } from '../../shared/constants.js';
import { daFetch, getFirstSheet } from '../../shared/utils.js';
import { getNx, sanitizePathParts } from '../../../scripts/utils.js';

// Components
import '../da-breadcrumbs/da-breadcrumbs.js';
import '../da-new/da-new.js';
import '../da-search/da-search.js';
import '../da-list/da-list.js';

// Styles
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const STYLE = await getStyle(import.meta.url);

export default class DaBrowse extends LitElement {
  static properties = {
    details: { attribute: false },
    _tabItems: { state: true },
    _searchItems: { state: true },
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
    this.shadowRoot.adoptedStyleSheets = [STYLE];
    document.addEventListener('keydown', this.handleShortcuts.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.handleShortcuts.bind(this));
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
      // Only re-fetch if the orgs are different
      const reFetch = props.get('details')?.owner !== this.details.owner;
      this.editor = await this.getEditor(reFetch);
    }

    super.update(props);
  }

  async getEditor(reFetch) {
    const DEF_EDIT = '/edit#';

    if (reFetch) {
      const resp = await daFetch(`${DA_ORIGIN}/config/${this.details.owner}/`);
      if (!resp.ok) return DEF_EDIT;
      const json = await resp.json();

      const rows = getFirstSheet(json);
      this.editorConfs = rows?.reduce((acc, row) => {
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
    const matchedConf = matchedConfs.sort((a, b) => b.length - a.length)[0];

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

  renderNew() {
    return html`
      <da-new
        @newitem=${this.handleNewItem}
        fullpath="${this.details.fullpath}"
        editor="${this.editor}">
      </da-new>`;
  }

  renderSearch() {
    return html`<da-search @updated=${this.handleSearch} fullpath="${this.details.fullpath}"></da-search>`;
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
      <div class="da-tablist" role="tablist" aria-label="Dark Alley content">
        ${this._tabItems.map((tab, idx) => html`
          <button
            id="tab-${tab.id}"
            type="button"
            role="tab"
            aria-selected="${tab.selected}"
            aria-controls="tabpanel-${tab.id}"
            @click=${() => { this.handleTabClick(idx); }}>
            <span class="focus">${tab.title}</span>
          </button>`)}
      </div>
      <div class="da-list-header context-${this.context}">
        <da-breadcrumbs fullpath="${this.details.fullpath}" depth="${this.details.depth}"></da-breadcrumbs>
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
    `;
  }
}

customElements.define('da-browse', DaBrowse);
