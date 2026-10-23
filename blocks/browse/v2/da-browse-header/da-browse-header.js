import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../../scripts/utils.js';

await import(`${getNx()}/blocks/shared/switch/switch.js`);
await import(`${getNx()}/blocks/shared/segmented-btn/segmented.js`);
await import(`${getNx()}/blocks/shared/popover/popover.js`);

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { PANEL_EVENT } = await import(`${getNx()}/utils/panel.js`);
const [BUTTONS, style] = await Promise.all([
  loadStyle(`${getNx2()}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);

const VIEW_ITEMS = [
  { value: 'list', label: 'List view', icon: '/img/icons/s2-icon-viewlist-20-n.svg', iconOnly: true },
  { value: 'card', label: 'Card view', icon: '/img/icons/s2-icon-viewgrid-20-n.svg', iconOnly: true },
];

export default class DaBrowseHeader extends LitElement {
  static properties = {
    details: { attribute: false },
    chatEnabled: { type: Boolean },
    groupByType: { type: Boolean },
    view: { type: String },
    rowSize: { type: String },
    cardSize: { type: String },
    _appearanceOpen: { state: true },
    _sortOpen: { state: true },
    typesFilterState: { attribute: false },
    sortState: { attribute: false },
    searchState: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [BUTTONS, style];
  }

  requestTypesFilter({ currentTarget }) {
    this.dispatchEvent(new CustomEvent('typesfilterrequest', {
      detail: { anchor: currentTarget },
      bubbles: true,
      composed: true,
    }));
  }

  requestSort(property, direction) {
    if (this.sortState.loading) return;
    this.dispatchEvent(new CustomEvent('sortrequest', {
      detail: { property, direction },
      bubbles: true,
      composed: true,
    }));
  }

  requestGroupByType({ detail }) {
    this.dispatchEvent(new CustomEvent('groupbytypechange', {
      detail: { group: detail.checked },
      bubbles: true,
      composed: true,
    }));
  }

  requestView({ detail }) {
    if (!['list', 'card'].includes(detail.value)) return;
    this.dispatchEvent(new CustomEvent('viewchange', {
      detail: { view: detail.value },
      bubbles: true,
      composed: true,
    }));
  }

  requestChat() {
    document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail: { section: 'chat' } }));
  }

  async toggleAppearance({ currentTarget }) {
    const popover = this.shadowRoot.querySelector('.browse-appearance-popover');
    if (this._appearanceOpen) {
      popover.close();
      return;
    }
    this._appearanceOpen = true;
    await this.updateComplete;
    popover.show({ anchor: currentTarget, placement: 'auto' });
    const layout = popover.querySelector('.browse-view-control');
    await layout.updateComplete;
    layout.shadowRoot?.querySelector('button[aria-pressed="true"], button')?.focus();
  }

  renderAppearance() {
    const card = this.view === 'card';
    return html`
      <button type="button" class="browse-toolbar-control nx-action-btn-quiet"
        aria-haspopup="dialog" aria-expanded=${Boolean(this._appearanceOpen)}
        title="Appearance" @click=${this.toggleAppearance}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-viewlist-20-n.svg#icon"></use></svg>
        <span class="browse-control-label">Appearance</span>
      </button>
      <nx-popover class="browse-appearance-popover" role="dialog" aria-label="Appearance"
        @close=${() => { this._appearanceOpen = false; }}
        @keydown=${(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        event.currentTarget.close();
        this.shadowRoot.querySelector('button[title="Appearance"]').focus();
      }}>
        <div class="browse-appearance-row">
          <span>Layout</span>
          <nx-segmented-btn class="browse-view-control" size="sm" label="Layout" .items=${VIEW_ITEMS}
            .value=${this.view} @change=${this.requestView}></nx-segmented-btn>
        </div>
        <div class="browse-appearance-row">
          <span>${card ? 'Card Size' : 'Row Size'}</span>
          <nx-segmented-btn size="sm" label=${card ? 'Card size' : 'Row size'}
            .items=${[
        { value: 's', label: 'S' }, { value: 'm', label: 'M' }, { value: 'l', label: 'L' },
      ]}
            .value=${(card ? this.cardSize : this.rowSize) || 'm'}
            @change=${({ detail }) => {
        if (!['s', 'm', 'l'].includes(detail.value)) return;
        this.dispatchEvent(new CustomEvent('appearancesizechange', {
          detail: { view: card ? 'card' : 'list', size: detail.value },
          bubbles: true,
          composed: true,
        }));
      }}></nx-segmented-btn>
        </div>
      </nx-popover>`;
  }

  renderSettingsActions() {
    if (!this.details?.org || this.details.path) return nothing;
    const href = this.details.site
      ? `/config#/${this.details.org}/${this.details.site}/`
      : `/config#/${this.details.org}/`;
    const label = `Configure ${this.details.site ? 'Site' : 'Org'}`;
    return html`
      <a class="browse-settings-link browse-toolbar-control nx-action-btn-quiet" href="${href}" title=${label}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-settings-20-n.svg#icon"></use></svg>
        <span class="browse-control-label">${label}</span>
      </a>`;
  }

  renderSortOptions() {
    const options = [
      { value: 'name:ascending', label: 'Name (A-Z)' },
      { value: 'name:descending', label: 'Name (Z-A)' },
      { value: 'lastModified:descending', label: 'Modified at (Newest)' },
      { value: 'lastModified:ascending', label: 'Modified at (Oldest)' },
    ];
    return html`
      <button type="button" class="browse-sort-control browse-toolbar-control nx-action-btn-quiet"
        title=${this.sortLabel} aria-label="Sort files" aria-haspopup="dialog"
        aria-expanded=${Boolean(this._sortOpen)} aria-busy=${this.sortState.loading}
        ?disabled=${this.sortState.loading} @click=${this.toggleSort}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-sort-20-n.svg#icon"></use></svg>
        <span class="browse-control-label">Sort</span>
      </button>
      <nx-popover class="browse-sort-popover" role="dialog" aria-label="Sort"
        @close=${() => { this._sortOpen = false; }}
        @keydown=${(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        event.currentTarget.close();
        this.shadowRoot.querySelector('.browse-sort-control').focus();
      }}>
        <div class="browse-sort-options">
          ${options.map(({ value, label }) => {
        const selected = value === `${this.sortState.property}:${this.sortState.direction}`;
        return html`<button type="button" class="browse-sort-option nx-action-btn-quiet"
              aria-pressed=${selected} ?disabled=${this.sortState.loading}
              @click=${() => {
            const [property, direction] = value.split(':');
            this.requestSort(property, direction);
            this.shadowRoot.querySelector('.browse-sort-popover').close();
            this.shadowRoot.querySelector('.browse-sort-control').focus();
          }}>
              <svg viewBox="0 0 20 20" aria-hidden="true" style=${selected ? '' : 'visibility: hidden'}>
                <use href="/img/icons/s2-icon-checkmark-20-n.svg#icon"></use>
              </svg>
              <span>${label}</span>
            </button>`;
      })}
        </div>
      </nx-popover>`;
  }

  async toggleSort({ currentTarget }) {
    const popover = this.shadowRoot.querySelector('.browse-sort-popover');
    if (this._sortOpen) {
      popover.close();
      return;
    }
    this._sortOpen = true;
    await this.updateComplete;
    popover.show({ anchor: currentTarget, placement: 'auto' });
    popover.querySelector('[aria-pressed="true"], button')?.focus();
  }

  get sortLabel() {
    if (!this.sortState.property) return 'Sort: Default';
    const name = this.sortState.property === 'name';
    const ascending = this.sortState.direction === 'ascending';
    const nameDirection = ascending ? 'A-Z' : 'Z-A';
    const dateDirection = ascending ? 'oldest first' : 'newest first';
    return `Sorted by ${name ? 'Name' : 'Modified'} (${name ? nameDirection : dateDirection})`;
  }

  renderToolbarControls() {
    const typesLabel = this.typesFilterState.hiddenCount
      ? `${this.typesFilterState.hiddenCount} ${this.typesFilterState.hiddenCount === 1 ? 'type' : 'types'} hidden`
      : 'Show All';
    return html`
      <div class="browse-toolbar-controls" role="group" aria-label="Browse toolbar controls">
        <nx-switch class="browse-group-control" label="Group by type" .checked=${this.groupByType}
          @change=${this.requestGroupByType}></nx-switch>
        <button type="button" class="browse-toolbar-control nx-action-btn-quiet" aria-haspopup="dialog"
          title=${typesLabel} aria-expanded=${this.typesFilterState.open} @click=${this.requestTypesFilter}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-filter-20-n.svg#icon"></use></svg>
          <span class="browse-control-label">${typesLabel}</span>
        </button>
        ${this.renderSortOptions()}
        ${this.renderAppearance()}
        ${this.renderSettingsActions()}
        <slot name="actions"></slot>
      </div>`;
  }

  get searchResultsSummary() {
    const { count } = this.searchState;
    return count ? `${count} ${count === 1 ? 'result' : 'results'} found` : 'No results found';
  }

  get searchSummary() {
    if (!this.searchState || this.searchState.error) return '';
    return this.searchState.loading ? 'Searching...' : this.searchResultsSummary;
  }

  render() {
    return html`
      <div class="browse-toolbar-leading">
        ${this.chatEnabled ? html`
          <button type="button" part="chat-btn" class="chat-btn nx-action-btn-icon" aria-label="Open chat panel" @click=${this.requestChat}>
            <svg aria-hidden="true" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-splitleft-20-n.svg#icon"></use></svg>
          </button>` : nothing}
        ${this.searchState ? nothing : html`<slot></slot>`}
        <p class="browse-search-summary" aria-hidden="true" ?data-loading=${this.searchState?.loading}>${this.searchState && !this.searchState.error ? html`
          <span class="browse-search-progress">Searching...${this.searchState.count
          ? html` &#183; ${this.searchState.count} found` : nothing}</span>
          <span class="browse-search-complete">${this.searchResultsSummary}</span>` : nothing}</p>
        <p class="browse-search-status" role="status" aria-atomic="true">${this.searchSummary}</p>
      </div>
      ${this.renderToolbarControls()}`;
  }
}

customElements.define('da-browse-header', DaBrowseHeader);
