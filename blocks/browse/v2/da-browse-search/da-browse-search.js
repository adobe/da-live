import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2Api } from '../../../../scripts/utils.js';
import { getTypeLabel, iconPathForExt } from '../../../shared/icons.js';
import { getBrowseItemHref } from '../shared/navigation.js';
import { loadFilenames, matchFilenames } from './utils.js';

const { listKeydown } = await import(`${getNx()}/blocks/shared/utils/list-nav.js`);
const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const [SEARCH, style] = await Promise.all([
  loadStyle(`${getNx()}/blocks/shared/search/search.css`),
  loadStyle(import.meta.url),
]);

export default class DaBrowseSearch extends LitElement {
  static properties = {
    value: { type: String },
    label: { type: String },
    placeholder: { type: String },
    disabled: { type: Boolean, reflect: true },
    variant: { type: String, reflect: true },
    size: { type: String, reflect: true },
    fullpath: { type: String },
    editor: { type: String },
    matchCase: { type: Boolean },
    getDirectory: { attribute: false },
    _suggestions: { state: true },
    _status: { state: true },
    _active: { state: true },
    _open: { state: true },
  };

  connectedCallback() {
    this.value ??= '';
    this.label ??= 'Search';
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [SEARCH, style];
  }

  get input() { return this.shadowRoot.querySelector('input'); }

  get popover() { return this.shadowRoot.querySelector('nx-popover'); }

  get suggestionsOpen() { return !!this._open; }

  onInput(event) {
    this.value = event.target.value;
    this._dismissed = false;
    this._active = undefined;
  }

  onChange(event) {
    event.stopPropagation();
    this.value = event.target.value;
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  onFocus = () => {
    this._dismissed = false;
    this.refreshSuggestions();
  };

  onBlur = () => this.closeSuggestions();

  onClose = () => {
    this._dismissed = true;
    this._active = undefined;
    this._open = false;
    this._openRequest = undefined;
    this._resizeObserver?.disconnect();
  };

  closeSuggestions() {
    this.popover?.close?.();
    this.onClose();
  }

  resetCatalog() {
    this._metadataRequest = undefined;
    this._navigationRequest = undefined;
    this._catalog?.controller?.abort();
    this._catalog = undefined;
    this._suggestions = undefined;
    this._status = undefined;
    this.closeSuggestions();
  }

  clear() {
    if (this.disabled) return;
    this.resetCatalog();
    if (!this.input.value) return;
    this.input.value = '';
    this.value = '';
    this.focus();
    this.dispatchEvent(new InputEvent('input', {
      inputType: 'deleteContentBackward',
      bubbles: true,
      composed: true,
    }));
  }

  focus(options) {
    this.input?.focus(options);
  }

  submitSearch() {
    this.dispatchEvent(new CustomEvent('search-submit', {
      detail: { value: this.value },
      bubbles: true,
      composed: true,
    }));
  }

  disconnectedCallback() {
    this.resetCatalog();
    super.disconnectedCallback();
  }

  async showSuggestions() {
    if (this.disabled || !this.value.trim() || this._dismissed) return;
    const request = {};
    this._openRequest = request;
    try {
      this._popoverReady ??= import(`${getNx()}/blocks/shared/popover/popover.js`);
      await this._popoverReady;
      await this.updateComplete;
      if (this._openRequest !== request || !this.isConnected || this.disabled
        || this.shadowRoot.activeElement !== this.input || !this.value.trim()) return;
      const anchor = this.shadowRoot.querySelector('.search-field');
      this.popover.style.width = `${anchor.getBoundingClientRect().width}px`;
      this.popover.show({ anchor, placement: 'auto' });
      this._open = true;
      this._resizeObserver ??= new ResizeObserver(() => {
        if (!this.popover?.open) return;
        this.popover.style.width = `${anchor.getBoundingClientRect().width}px`;
        this.popover.reposition();
      });
      this._resizeObserver.observe(anchor);
    } catch (error) {
      this._popoverReady = undefined;
      if (this._openRequest !== request) return;
      this._status = `Suggestions unavailable: ${error.message}`;
      this.closeSuggestions();
    }
  }

  updateSuggestions() {
    const catalog = this._catalog;
    const matches = matchFilenames({
      items: catalog?.items ?? [],
      query: this.value,
      matchCase: this.matchCase !== false,
    });
    this._suggestions = [
      ...matches.slice(0, 5).map((item) => ({
        value: item.path,
        label: item.ext ? `${item.name}.${item.ext}` : item.name,
        description: getTypeLabel(item.ext),
        icon: `${iconPathForExt(item.ext)}#icon`,
        item,
      })),
      { value: 'search', label: 'Search this folder and subfolders', description: 'Filenames and content', action: true },
    ];
    if (catalog?.error) this._status = `Could not load all filenames: ${catalog.error}`;
    else if (!catalog || catalog.loading) this._status = 'Loading filenames in this folder...';
    else if (!matches.length) this._status = 'No matching filenames in this folder';
    else this._status = matches.length > 5 ? `Showing 5 of ${matches.length} matching filenames` : undefined;
    if (!this._suggestions.some((item) => item.value === this._active)) this._active = undefined;
    this.showSuggestions();
  }

  async loadCatalog(catalog, snapshot) {
    try {
      const list = snapshot.continuationToken ? (await getNx2Api()).source.list : undefined;
      if (this._catalog !== catalog) return;
      catalog.items = await loadFilenames({
        snapshot,
        list,
        signal: catalog.controller.signal,
        onPage: (items) => {
          if (this._catalog !== catalog) return;
          catalog.items = items;
          this.updateSuggestions();
        },
      });
    } catch (error) {
      if (error.name === 'AbortError' || this._catalog !== catalog) return;
      catalog.error = error.message;
    }
    if (this._catalog !== catalog) return;
    catalog.loading = false;
    this.updateSuggestions();
  }

  async refreshSuggestions() {
    if (this.disabled || !this.value.trim()
      || this.shadowRoot.activeElement !== this.input) return;
    this.updateSuggestions();
    const request = {};
    const { fullpath } = this;
    this._metadataRequest = request;
    try {
      const snapshot = await this.getDirectory();
      if (this._metadataRequest !== request || !this.isConnected || fullpath !== this.fullpath
        || snapshot.fullpath !== fullpath || !this.value.trim()) return;
      if (this._catalog?.version === snapshot.version && this._catalog.fullpath === fullpath) {
        this.updateSuggestions();
        await this._catalog.ready;
        return;
      }
      this._catalog?.controller?.abort();
      const catalog = {
        fullpath,
        version: snapshot.version,
        items: [...snapshot.items],
        loading: true,
        controller: new AbortController(),
      };
      this._catalog = catalog;
      this.updateSuggestions();
      catalog.ready = this.loadCatalog(catalog, snapshot);
      await catalog.ready;
    } catch (error) {
      if (this._metadataRequest !== request || !this.isConnected
        || fullpath !== this.fullpath) return;
      this._catalog = { fullpath, items: [], loading: false, error: error.message };
      this.updateSuggestions();
    }
  }

  navigate(href) {
    window.location.assign(href);
  }

  async selectSuggestion(option) {
    if (!option || this.disabled) return;
    this.closeSuggestions();
    if (option.action) {
      this.submitSearch();
      return;
    }
    const request = {};
    this._navigationRequest = request;
    try {
      const href = await getBrowseItemHref({ ...option.item, editor: this.editor });
      if (this._navigationRequest === request && this.isConnected && !this.disabled) {
        this.navigate(href);
      }
    } catch (error) {
      if (this._navigationRequest !== request || !this.isConnected) return;
      this._status = `Could not open file: ${error.message}`;
      this._dismissed = false;
      this.showSuggestions();
    }
  }

  onKeydown(event) {
    if (event.isComposing || this.disabled) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closeSuggestions();
      return;
    }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && this.value.trim()) {
      event.preventDefault();
      this._dismissed = false;
      this.showSuggestions();
      listKeydown(event.key, {
        items: this._suggestions,
        active: this._active,
        itemKey: 'value',
        setActive: (value) => { this._active = value; },
        focusActiveItem: false,
      });
      return;
    }
    if (event.key === 'Enter') {
      if (this._open && this._active !== undefined) {
        event.preventDefault();
        this.selectSuggestion(this._suggestions.find((item) => item.value === this._active));
        return;
      }
      this.closeSuggestions();
      event.preventDefault();
      this.submitSearch();
    }
  }

  updated(changed) {
    if (changed.has('fullpath') || !this.value.trim()) this.resetCatalog();
    else if (this.disabled) this.closeSuggestions();
    else if ((changed.has('value') || changed.has('matchCase') || changed.has('getDirectory'))
      && !this._dismissed) {
      this._active = undefined;
      this.refreshSuggestions();
    }
    const index = this._suggestions?.findIndex((item) => item.value === this._active) ?? -1;
    if (changed.has('_active') && this._active !== undefined) {
      this.shadowRoot.getElementById(`search-option-${index}`)?.scrollIntoView({ block: 'nearest' });
    }
  }

  render() {
    const activeIndex = this._suggestions?.findIndex((item) => item.value === this._active) ?? -1;
    return html`
      <div class="search-field">
        <svg class="search-icon" viewBox="0 0 20 20" aria-hidden="true">
          <use href="/img/icons/s2-icon-search-20-n.svg#icon"></use>
        </svg>
        <input type="search" role="combobox" aria-label=${this.label}
          aria-autocomplete="list" aria-haspopup="listbox" aria-expanded=${!!this._open}
          aria-controls="search-options"
          aria-activedescendant=${this._open && activeIndex >= 0 ? `search-option-${activeIndex}` : nothing}
          placeholder=${this.placeholder ?? ''} autocomplete="off"
          .value=${this.value} ?disabled=${this.disabled}
          @input=${this.onInput} @change=${this.onChange}
          @focus=${this.onFocus} @blur=${this.onBlur} @keydown=${this.onKeydown}>
        <button type="button" aria-label="Clear search" ?hidden=${!this.value}
          ?disabled=${this.disabled} @click=${this.clear}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <use href="/img/icons/s2-icon-close-20-n.svg#icon"></use>
          </svg>
        </button>
        <slot name="actions"></slot>
      </div>
      <p class="suggestions-error" role="status" ?hidden=${this._open || !this._status?.startsWith('Suggestions unavailable:')}>${this._status}</p>
      <nx-popover class="search-suggestions" @close=${this.onClose}>
        ${this._status ? html`<p class="search-suggestions-status" role="status">${this._status}</p>` : nothing}
        <ul id="search-options" role="listbox" aria-label=${this.label}>
          ${(this._suggestions ?? []).map((option, index) => html`
            <li id="search-option-${index}" role="option" aria-selected=${option.value === this._active}
              class="search-option ${option.action ? 'search-option-action' : ''}"
              @pointerdown=${(event) => { event.preventDefault(); }}
              @click=${() => this.selectSuggestion(option)}>
              ${option.icon ? html`<svg viewBox="0 0 20 20" aria-hidden="true"><use href=${option.icon}></use></svg>` : nothing}
              <span class="search-option-content">
                <span class="search-option-label">${option.label}</span>
                ${option.description ? html`<span class="search-option-description">${option.description}</span>` : nothing}
              </span>
              ${option.action ? html`<span class="search-option-shortcut" aria-hidden="true">Enter</span>` : nothing}
            </li>`)}
        </ul>
      </nx-popover>`;
  }
}

customElements.define('da-browse-search', DaBrowseSearch);
