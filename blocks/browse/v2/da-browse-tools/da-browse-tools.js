import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2 } from '../../../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { PANEL_EVENT } = await import(`${getNx()}/utils/panel.js`);

const [FORM, BUTTON, STYLE] = await Promise.all([
  loadStyle(`${getNx2()}/styles/form.css`),
  loadStyle(`${getNx2()}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);

class DaBrowseTools extends LitElement {
  static properties = {
    searchState: { attribute: false },
    _replacement: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [FORM, BUTTON, STYLE];
  }

  focus() {
    this.shadowRoot.querySelector('#find')?.focus();
  }

  get matchCase() {
    return this.searchState?.matchCase ?? true;
  }

  get findValue() {
    return this.searchState?.draft ?? this.searchState?.term ?? '';
  }

  get canFind() {
    return !!this.findValue.trim() && !!this.searchState?.scope
      && !this.searchState.replacement?.loading;
  }

  get hasReplacement() {
    return !!this._replacement;
  }

  get canClear() {
    return !!this.findValue || !!this._replacement || !!this.searchState?.term;
  }

  get hasCurrentQuery() {
    return !!this.searchState?.term && this.findValue.trim() === this.searchState.term;
  }

  get replaceCount() {
    const items = this.searchState?.items ?? [];
    return items.filter((item) => item.matchContext?.snippets.length).length;
  }

  get canReplace() {
    const state = this.searchState;
    return this.hasCurrentQuery && this.replaceCount > 0 && state.canWrite
      && !state.loading && !state.error && !state.replacement?.loading;
  }

  willUpdate(props) {
    if (props.has('searchState') && !this.searchState?.term && !this.searchState?.draft) {
      this._replacement = '';
    }
  }

  toggleCase() {
    this.dispatchEvent(new CustomEvent('matchcasechange', { detail: { matchCase: !this.matchCase }, bubbles: true, composed: true }));
  }

  clear() {
    this._replacement = '';
    this.dispatchEvent(new CustomEvent('findchange', { detail: { value: '' }, bubbles: true, composed: true }));
    this.focus();
  }

  changeFind(event) {
    this.dispatchEvent(new CustomEvent('findchange', { detail: { value: event.target.value }, bubbles: true, composed: true }));
  }

  submitFind(event) {
    event.preventDefault();
    if (!this.canFind) return;
    this.dispatchEvent(new CustomEvent('search-submit', { detail: { value: this.findValue }, bubbles: true, composed: true, cancelable: true }));
  }

  replace() {
    if (!this.canReplace || !this.hasReplacement) return;
    this.dispatchEvent(new CustomEvent('replacerequest', { detail: { replacement: this._replacement ?? '' }, bubbles: true, composed: true }));
  }

  close() {
    this.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { detail: { section: 'tools' }, bubbles: true, composed: true }));
  }

  renderMatch({ text, replacement }) {
    if (!replacement) return html`<mark>${text}</mark>`;
    return html`<del class="browse-match-removed">${text}</del>${replacement
      ? html`<ins class="browse-match-replaced">${replacement}</ins>` : nothing}`;
  }

  renderSnippet({ snippet, replacement }) {
    const parts = snippet.matches.map(({ start, end }, index) => {
      const before = snippet.text.slice(index ? snippet.matches[index - 1].end : 0, start);
      const match = this.renderMatch({ text: snippet.text.slice(start, end), replacement });
      return html`${before}${match}`;
    });
    const tail = snippet.text.slice(snippet.matches.at(-1)?.end ?? 0);
    return html`${snippet.truncatedStart ? '...' : nothing}${parts}${tail}${snippet.truncatedEnd ? '...' : nothing}`;
  }

  renderMatchContext() {
    const items = this.searchState?.items;
    if (!this.hasCurrentQuery || !items?.length) return nothing;
    const filenameOnly = items.filter((item) => item.matchContext?.filenameMatch
      && !item.matchContext.snippets.length);
    const withContext = items.filter((item) => !filenameOnly.includes(item));
    const shown = withContext.slice(0, 3);
    const showReplacement = this._replacement !== undefined;
    const replacement = showReplacement ? this._replacement ?? '' : undefined;
    return html`
      <section class="browse-match-context" aria-label="Match context">
        ${shown.map((item) => {
      const context = item.matchContext;
      return html`
          <div class="browse-match-file" data-match-file=${item.path}>
            <h4 title=${item.path}>${item.name || item.path}</h4>
            ${context?.snippets.length ? html`${context.snippets.map((snippet) => html`
            <div class="browse-match-snippet">
              <pre data-preview="match" role="group" aria-label=${showReplacement
          ? 'Replacement preview: deleted text followed by inserted text'
          : 'Matching source excerpt'}>${this.renderSnippet({ snippet, replacement })}</pre>
            </div>`)}
              ${context.moreCount ? html`<p>+${context.moreCount} more ${context.moreCount === 1 ? 'match' : 'matches'} in this file</p>` : nothing}`
          : html`<p>Source context is unavailable for this result.</p>`}
          </div>`;
    })}
        ${withContext.length > shown.length ? html`
          <p>Showing context for ${shown.length} of ${withContext.length} results with matching content. All results are in browse.</p>` : nothing}
        ${filenameOnly.length ? html`
          <div class="browse-match-file" data-match-group="filename">
            <h4>Filename matches (${filenameOnly.length})</h4>
            <p>No matching content to replace.</p>
            <ul>${filenameOnly.slice(0, 10).map((item) => html`<li title=${item.path}>${item.name || item.path}</li>`)}</ul>
            ${filenameOnly.length > 10 ? html`<p>and ${filenameOnly.length - 10} more.</p>` : nothing}
          </div>` : nothing}
      </section>`;
  }

  render() {
    const state = this.searchState;
    const replacement = state?.replacement;
    const { matchCase } = this;
    return html`
      <header class="browse-tools-header">
        <h2>Advanced Search</h2>
      </header>
      <section class="browse-tools-content" aria-label="Advanced Search">
        <p>Enter a term to search the content of all pages in this folder</p>  
      <form class="browse-search-form" @submit=${this.submitFind}>
          <div class="nx-form-field">
            <span class="browse-find-field">
              <input class="nx-input" id="find" type="text" .value=${this.findValue}
                aria-label="Find" placeholder="Find in files" ?disabled=${replacement?.loading} @input=${this.changeFind}>
              <button type="button" id="match-case" class="browse-match-case nx-action-btn-icon ${matchCase ? 'is-active' : ''}" title="Match case"
                aria-label="Match case" aria-pressed=${matchCase ? 'true' : 'false'}
                ?disabled=${replacement?.loading} @click=${this.toggleCase}>Aa</button>
            </span>
          </div>
          <div class="nx-form-field">
            <input class="nx-input" id="replacement" type="text" .value=${this._replacement ?? ''}
              aria-label="Replace with" placeholder="Replace with"
              ?disabled=${replacement?.loading} @input=${(event) => {
        this._replacement = event.target.value;
      }}>
          </div>
          <div class="browse-search-actions" role="group" aria-label="Search actions">
            <button type="button" id="clear-btn" class="nx-form-btn-secondary" ?disabled=${!this.canClear || replacement?.loading}
              @click=${this.clear}>Clear</button>
            <button type="submit" id="find-btn" class="nx-btn-primary" ?disabled=${!this.canFind || state?.loading}
              aria-busy=${state?.loading ? 'true' : 'false'}>
              Find ${state?.loading ? html`<span class="nx-loading-spinner" role="status" aria-label="Searching"></span>` : ''}
            </button>
            <button type="button" id="replace-btn" class="nx-form-btn-primary"
              ?disabled=${!this.canReplace || !this.hasReplacement}
              aria-busy=${replacement?.loading ? 'true' : 'false'}
              @click=${this.replace}>
              Replace All ${replacement?.loading ? html`<span class="nx-loading-spinner" role="status" aria-label="Replacing"></span>` : ''}
            </button>
          </div>
        </form>
        ${state?.error ? html`<p role="alert">${state.error}</p>` : nothing}
        ${state?.canWrite === false ? html`<p>Write permission is required to replace text.</p>` : nothing}
        ${replacement?.replaced !== undefined ? html`<p role="status">Replaced text in ${replacement.replaced} ${replacement.replaced === 1 ? 'file' : 'files'}.</p>` : nothing}
        ${replacement?.error ? html`<p role="alert">${replacement.error}</p>` : nothing}
        ${replacement?.skipped ? html`<p>${replacement.skipped} ${replacement.skipped === 1 ? 'file had' : 'files had'} no matching text.</p>` : nothing}
        ${replacement?.errors?.length ? html`
          <div role="alert">
            <p>Some files could not be updated:</p>
            <ul>${replacement.errors.map(({ path, error }) => html`<li>${path}: ${error}</li>`)}</ul>
          </div>` : nothing}
        ${this.renderMatchContext()}
      </section>`;
  }
}

customElements.define('da-browse-tools', DaBrowseTools);
