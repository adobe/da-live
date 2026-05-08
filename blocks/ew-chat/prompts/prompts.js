import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

await import(`${getNx()}/blocks/shared/picker/picker.js`);

const styles = await loadStyle(import.meta.url);

const ALL_CATEGORY = 'all';

class NxPrompts extends LitElement {
  static properties = {
    prompts: { attribute: false },
    _search: { state: true },
    _category: { state: true },
  };

  _search = '';

  _category = ALL_CATEGORY;

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  willUpdate(changed) {
    if (changed.has('prompts')) {
      const seen = new Set();
      this._categories = [
        { value: ALL_CATEGORY, label: 'All' },
        ...(this.prompts ?? [])
          .map((p) => p.category)
          .filter((c) => c && c !== ALL_CATEGORY && !seen.has(c) && seen.add(c))
          .map((c) => ({ value: c, label: c })),
      ];
    }
  }

  get _filtered() {
    const search = this._search.toLowerCase();
    return (this.prompts ?? []).filter((p) => {
      if (this._category !== ALL_CATEGORY && p.category !== this._category) return false;
      if (!search) return true;
      return p.title?.toLowerCase().includes(search)
        || p.description?.toLowerCase().includes(search);
    });
  }

  _onListKeydown(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...this.shadowRoot.querySelectorAll('.prompt-item')];
    if (!items.length) return;
    e.preventDefault();
    const cur = items.indexOf(e.target);
    const next = e.key === 'ArrowDown'
      ? items[(cur + 1) % items.length]
      : items[(cur <= 0 ? items.length : cur) - 1];
    next.focus({ preventScroll: true });
  }

  _onSearch(e) {
    this._search = e.target.value;
  }

  _clearSearch() {
    const input = this.shadowRoot.querySelector('.prompts-search-input');
    if (input) input.value = '';
    this._search = '';
    input?.focus();
  }

  _onCategoryChange(e) {
    this._category = e.detail.value;
  }

  focus() {
    this.shadowRoot.querySelector('.prompts-search-input')?.focus();
  }

  render() {
    const total = this.prompts?.length ?? 0;
    const filtered = this._filtered;
    const placeholder = this._category === ALL_CATEGORY
      ? `Search all ${total} prompts`
      : `Search in ${this._category}`;
    return html`
      <div class="prompts-header">
        <input
          type="search"
          name="prompt-search"
          aria-label=${placeholder}
          class="prompts-search-input"
          placeholder=${placeholder}
          .value=${this._search}
          @input=${this._onSearch}
          autocomplete="off"
        />
        <button type="button" class="prompts-clear" aria-label="Clear search" @click=${this._clearSearch}></button>
        <nx-picker
          .items=${this._categories}
          .value=${this._category}
          placement="below-end"
          @change=${this._onCategoryChange}
        ></nx-picker>
      </div>
      <ul class="prompts-list" @keydown=${this._onListKeydown}>
        ${filtered.map((p) => html`
          <li>
            <button class="prompt-item" type="button" @click=${() => this.onSend?.(p.prompt)}>
              <div class="prompt-item-header">
                <span class="prompt-item-title">${p.title}</span>
                ${p.category ? html`<span class="prompt-item-category">${p.category}</span>` : nothing}
              </div>
              ${p.description ? html`<span class="prompt-item-desc">${p.description}</span>` : nothing}
            </button>
          </li>
        `)}
        ${total && !filtered.length ? html`<p class="prompts-empty">No prompts match your search.</p>` : nothing}
      </ul>
    `;
  }
}

customElements.define('nx-prompts', NxPrompts);
