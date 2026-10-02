import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';

await import(`${getNx()}/blocks/shared/switch/switch.js`);
await import(`${getNx()}/blocks/shared/popover/popover.js`);
await import(`${getNx()}/blocks/shared/menu/menu.js`);

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const [BUTTONS, style] = await Promise.all([
  loadStyle(`${getNx2()}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);

// Controlled toolbar: da-browse supplies list state and handles action requests.
// The default slot keeps da-new's creation and permission handling with its owner.
export default class DaBrowseHeader extends LitElement {
  static properties = {
    details: { attribute: false },
    chatEnabled: { type: Boolean },
    flattenFolders: { type: Boolean },
    typesFilterState: { attribute: false },
    sortState: { attribute: false },
    _viewOptionsOpen: { state: true },
  };

  connectedCallback() {
    this.flattenFolders ??= true;
    this.typesFilterState ??= { open: false, hiddenCount: 0 };
    this.sortState ??= { property: null, direction: 'none', loading: false };
    this._viewOptionsOpen ??= false;
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [BUTTONS, style];
  }

  toggleViewOptions({ currentTarget }) {
    const popover = this.shadowRoot.querySelector('.da-browse-view-options-popover');
    if (popover.open) popover.close();
    else popover.show({ anchor: currentTarget });
    this._viewOptionsOpen = popover.open;
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

  renderViewOptionsMenu() {
    return html`
      <nx-popover id="browse-view-options" class="da-browse-view-options-popover" role="dialog" aria-label="View Options"
        @close=${() => { this._viewOptionsOpen = false; }}>
        <div class="da-browse-view-options-row">
          <nx-switch label="Flatten folders" .checked=${this.flattenFolders}
            @change=${this.requestFlattenFolders}></nx-switch>
        </div>
      </nx-popover>`;
  }

  renderSortOptions() {
    const options = [
      { property: 'name', direction: 'ascending', label: 'Name (A-Z)' },
      { property: 'name', direction: 'descending', label: 'Name (Z-A)' },
      { property: 'lastModified', direction: 'descending', label: 'Modified (newest first)' },
      { property: 'lastModified', direction: 'ascending', label: 'Modified (oldest first)' },
    ];
    return html`
      <nx-menu class="da-browse-sort-menu" size="m"
        .items=${options.map(({ property, direction, label }) => ({
      id: `${property}:${direction}`,
      label,
      icon: this.sortState.property === property && this.sortState.direction === direction ? 'checkmark' : undefined,
    }))}
        @select=${({ detail }) => {
        const option = options.find(({ property, direction }) => detail.id === `${property}:${direction}`);
        if (option) this.requestSort(option.property, option.direction);
      }}>
        <button slot="trigger" type="button" class="da-browse-toolbar-control da-browse-sort-control nx-action-btn-quiet"
          aria-haspopup="menu" aria-expanded="false" aria-busy=${this.sortState.loading} ?disabled=${this.sortState.loading}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-sort-20-n.svg#icon"></use></svg>
          <span>${this.sortLabel}</span>
        </button>
      </nx-menu>`;
  }

  get sortLabel() {
    if (!this.sortState.property) return 'Sort: Default';
    const name = this.sortState.property === 'name';
    const ascending = this.sortState.direction === 'ascending';
    const nameDirection = ascending ? 'A-Z' : 'Z-A';
    const dateDirection = ascending ? 'oldest first' : 'newest first';
    return `Sorted by ${name ? 'Name' : 'Modified'} (${name ? nameDirection : dateDirection})`;
  }

  renderToolbarTrailing() {
    return html`
      <div class="da-browse-toolbar-controls" role="group" aria-label="Browse toolbar controls">
        <button type="button" class="da-browse-toolbar-control nx-action-btn-quiet" aria-haspopup="dialog"
          aria-controls="browse-view-options" aria-expanded=${this._viewOptionsOpen} @click=${this.toggleViewOptions}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-listbulleted-20-n.svg#icon"></use></svg>
          <span>View Options</span>
        </button>
        <button type="button" class="da-browse-toolbar-control nx-action-btn-quiet" aria-haspopup="dialog"
          aria-expanded=${this.typesFilterState.open} @click=${this.requestTypesFilter}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-filter-20-n.svg#icon"></use></svg>
          <span>${this.typesFilterState.hiddenCount
        ? `${this.typesFilterState.hiddenCount} ${this.typesFilterState.hiddenCount === 1 ? 'type' : 'types'} hidden`
        : 'Show All types'}</span>
        </button>
        ${this.renderSortOptions()}
        ${this.renderSettingsActions()}
        ${this.renderViewOptionsMenu()}
      </div>`;
  }

  render() {
    return html`
      <div class="da-browse-header">
        <div class="da-browse-toolbar">
          <div class="da-browse-toolbar-leading">
            <div class="da-browse-toolbar-actions">
              ${this.chatEnabled ? html`
                <button type="button" part="chat-btn" class="chat-btn nx-action-btn-icon" aria-label="Open chat panel" @click=${this.requestChat}>
                  <svg aria-hidden="true" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-splitleft-20-n.svg#icon"></use></svg>
                </button>` : nothing}
              <slot></slot>
            </div>
          </div>
          <div class="da-browse-toolbar-trailing">${this.renderToolbarTrailing()}</div>
        </div>
      </div>`;
  }
}

customElements.define('da-browse-header', DaBrowseHeader);
