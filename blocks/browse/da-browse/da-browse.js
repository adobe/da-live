import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

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

  renderNew() {
    return html`<da-new @newitem=${this.handleNewItem} fullpath="${this.details.fullpath}"></da-new>`;
  }

  renderSearch() {
    return html`<da-search @updated=${this.handleSearch} fullpath="${this.details.fullpath}"></da-search>`;
  }

  renderList(type, fullpath, select, sort, drag) {
    return html`
      <da-list
        class="da-list-type-${type}"
        fullpath="${fullpath}"
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
        <div class="da-tabpanel" id="tabpanel-${tab.id}" role="tabpanel" aria-labelledby="tab-${tab.id}" data-visible="${tab.selected}">
          ${tab.id === 'browse' ? this.renderList(tab.id, this.details.fullpath, true, true, true) : this.renderList(tab.id, null, false, false, false)}
        </div>
      `)}
    `;
  }
}

customElements.define('da-browse', DaBrowse);
