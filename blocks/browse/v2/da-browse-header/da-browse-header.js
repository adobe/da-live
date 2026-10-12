import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../../scripts/utils.js';

await import(`${getNx()}/blocks/shared/switch/switch.js`);
await import(`${getNx()}/blocks/shared/picker/picker.js`);

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const [BUTTONS, style] = await Promise.all([
  loadStyle(`${getNx2()}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);

export default class DaBrowseHeader extends LitElement {
  static properties = {
    details: { attribute: false },
    chatEnabled: { type: Boolean },
    flattenFolders: { type: Boolean },
    typesFilterState: { attribute: false },
    sortState: { attribute: false },
    searchState: { attribute: false },
  };

  connectedCallback() {
    this.flattenFolders ??= true;
    this.typesFilterState ??= { open: false, hiddenCount: 0 };
    this.sortState ??= { property: null, direction: 'none', loading: false };
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

  requestFlattenFolders({ detail }) {
    this.dispatchEvent(new CustomEvent('flattenfolderschange', {
      detail: { flatten: detail.checked },
      bubbles: true,
      composed: true,
    }));
  }

  requestChat() {
    this.dispatchEvent(new CustomEvent('chatrequest', { bubbles: true, composed: true }));
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

  renderSortOptions() {
    const options = [
      { value: 'name:ascending', label: 'Name (A-Z)' },
      { value: 'name:descending', label: 'Name (Z-A)' },
      { value: 'lastModified:descending', label: 'Modified (newest first)' },
      { value: 'lastModified:ascending', label: 'Modified (oldest first)' },
    ];
    return html`
      <nx-picker class="da-browse-sort-control" size="m" title=${this.sortLabel}
        .items=${options}
        .value=${this.sortState.property ? `${this.sortState.property}:${this.sortState.direction}` : ''}
        .labelOverride=${this.sortLabel}
        aria-label="Sort files" aria-busy=${this.sortState.loading} aria-disabled=${this.sortState.loading}
        ?inert=${this.sortState.loading}
        @change=${({ detail }) => {
        if (!options.some(({ value }) => value === detail.value)) return;
        const [property, direction] = detail.value.split(':');
        this.requestSort(property, direction);
      }}>
        <svg slot="prefix" viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-sort-20-n.svg#icon"></use></svg>
      </nx-picker>`;
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
      : 'Show All types';
    return html`
      <div class="da-browse-toolbar-controls" role="group" aria-label="Browse toolbar controls">
        ${this.renderSortOptions()}
        <button type="button" class="da-browse-toolbar-control nx-action-btn-quiet" aria-haspopup="dialog"
          title=${typesLabel} aria-expanded=${this.typesFilterState.open} @click=${this.requestTypesFilter}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-filter-20-n.svg#icon"></use></svg>
          <span class="da-browse-control-label">${typesLabel}</span>
        </button>
        <nx-switch class="da-browse-flatten-control" label="Flatten folders" .checked=${this.flattenFolders}
          @change=${this.requestFlattenFolders}></nx-switch>
        ${this.renderSettingsActions()}
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
      <div class="da-browse-toolbar-leading">
        ${this.chatEnabled ? html`
          <button type="button" part="chat-btn" class="chat-btn nx-action-btn-icon" aria-label="Open chat panel" @click=${this.requestChat}>
            <svg aria-hidden="true" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-splitleft-20-n.svg#icon"></use></svg>
          </button>` : nothing}
        ${this.searchState ? nothing : html`<slot></slot>`}
        <p class="da-browse-search-summary" aria-hidden="true" ?data-loading=${this.searchState?.loading}>${this.searchState && !this.searchState.error ? html`
          <span class="da-browse-search-progress">Searching...${this.searchState.count
          ? html` &#183; ${this.searchState.count} found` : nothing}</span>
          <span class="da-browse-search-complete">${this.searchResultsSummary}</span>` : nothing}</p>
        <p class="da-browse-search-status" role="status" aria-atomic="true">${this.searchSummary}</p>
      </div>
      ${this.renderToolbarControls()}`;
  }
}

customElements.define('da-browse-header', DaBrowseHeader);
