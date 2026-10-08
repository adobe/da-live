import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { PANEL_EVENT } = await import(`${getNx()}/utils/panel.js`);
const styles = await Promise.all([
  loadStyle(new URL('../../../shared/styles/base.css', import.meta.url).href),
  loadStyle(import.meta.url),
]);

class DaBrowseTools extends LitElement {
  static properties = {
    searchState: { attribute: false },
    _replacement: { state: true },
    _confirming: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = styles;
  }

  willUpdate(props) {
    const previous = props.get('searchState');
    if (props.has('searchState')
      && (previous?.request !== this.searchState?.request
        || (previous?.draft ?? previous?.term ?? '') !== this.findValue || !this.canReplace)) {
      this._confirming = false;
    }
  }

  updated(props) {
    if (props.has('_confirming') && this._confirming) {
      this.shadowRoot.querySelector('.browse-replace-actions button')?.focus();
    }
  }

  focus() {
    this.shadowRoot.querySelector('#find')?.focus();
  }

  get findValue() {
    return this.searchState?.draft ?? this.searchState?.term ?? '';
  }

  get canFind() {
    return !!this.findValue.trim() && !!this.searchState?.scope
      && !this.searchState.replacement?.loading;
  }

  get hasCurrentQuery() {
    return !!this.searchState?.term && this.findValue.trim() === this.searchState.term;
  }

  get canReplace() {
    const state = this.searchState;
    return this.hasCurrentQuery && state.count > 0 && state.canWrite
      && !state.loading && !state.error && !state.replacement?.loading;
  }

  get replacementSummary() {
    const replacement = this.searchState?.replacement;
    if (replacement?.loading) return 'Replacing...';
    if (!replacement || replacement.error) return '';
    const { replaced } = replacement;
    return `Replaced text in ${replaced} ${replaced === 1 ? 'file' : 'files'}.`;
  }

  changeCase(event) {
    this._confirming = false;
    this.dispatchEvent(new CustomEvent('matchcasechange', { detail: { matchCase: event.target.checked }, bubbles: true, composed: true }));
  }

  invalidateReplacement() {
    this._confirming = false;
  }

  changeFind(event) {
    this.invalidateReplacement();
    this.dispatchEvent(new CustomEvent('findchange', { detail: { value: event.target.value }, bubbles: true, composed: true }));
  }

  submitFind(event) {
    event.preventDefault();
    if (!this.canFind) return;
    this.dispatchEvent(new CustomEvent('search-submit', { detail: { value: this.findValue }, bubbles: true, composed: true, cancelable: true }));
  }

  confirmReplacement() {
    if (!this.canReplace || !this._confirming) return;
    this._confirming = false;
    this.shadowRoot.querySelector('[aria-label="Close panel"]').focus();
    this.dispatchEvent(new CustomEvent('replacerequest', { detail: { replacement: this._replacement ?? '' }, bubbles: true, composed: true }));
  }

  async cancelReplacement() {
    this._confirming = false;
    await this.updateComplete;
    this.shadowRoot.querySelector('.browse-replace-form [type="submit"]')?.focus();
  }

  close() {
    this._confirming = false;
    this.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { detail: { section: 'tools' }, bubbles: true, composed: true }));
  }

  renderMatch({ text, replacement }) {
    if (replacement === undefined) return html`<mark>${text}</mark>`;
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
    const shown = items.slice(0, 3);
    const showReplacement = this._replacement !== undefined || this._confirming;
    const replacement = showReplacement ? this._replacement ?? '' : undefined;
    return html`
      <section class="browse-match-context" aria-label="Match context">
        <h3>Matches</h3>
        <p class="browse-search-scope">Search-time source excerpts. Files are reread before saving.</p>
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
              ${context.hasMore ? html`<p>More matches are not shown.</p>` : nothing}`
          : html`<p>${context?.filenameMatch
            ? 'Filename match only. No matching content to replace.'
            : 'Source context is unavailable for this result.'}</p>`}
          </div>`;
    })}
        ${items.length > shown.length ? html`
          <p>Showing context for ${shown.length} of ${items.length} results. All results are in browse.</p>` : nothing}
      </section>`;
  }

  render() {
    const state = this.searchState;
    const replacement = state?.replacement;
    return html`
      <header class="browse-tools-header">
        <button class="da-icon-btn" type="button" aria-label="Close panel" @click=${this.close}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-splitright-20-n.svg#icon"></use></svg>
        </button>
        <h2>Advanced Search</h2>
      </header>
      <section class="browse-tools-content" aria-label="Advanced Search">
        <p class="browse-search-scope">${state?.scope ? `Search in ${state.scope}` : 'Search the current folder'}</p>
        <form class="browse-find-form" @submit=${this.submitFind}>
          <label class="da-form-field" for="find">
            Find
            <input class="da-input" id="find" type="text" .value=${this.findValue}
              placeholder="Find in files" ?disabled=${replacement?.loading} @input=${this.changeFind}>
          </label>
          <div class="browse-find-options">
            <label class="browse-match-case">
              <input id="match-case" type="checkbox" .checked=${state?.matchCase ?? true}
                ?disabled=${replacement?.loading} @change=${this.changeCase}>
              Match case
            </label>
            <button type="submit" class="da-btn-secondary" ?disabled=${!this.canFind}>Find</button>
          </div>
        </form>
        ${state?.term && !this.hasCurrentQuery ? html`<p>Run Find to update the results.</p>` : nothing}
        ${state?.error ? html`<p role="alert">${state.error}</p>` : nothing}
        <form class="browse-replace-form" @submit=${(event) => {
        event.preventDefault();
        if (this.canReplace) this._confirming = true;
      }}>
          <label class="da-form-field" for="replacement">
            Replace with
            <input class="da-input" id="replacement" type="text" .value=${this._replacement ?? ''}
              ?disabled=${replacement?.loading} @input=${(event) => {
        this._replacement = event.target.value;
        this._confirming = false;
      }}>
          </label>
          <p>Replaces text in file contents. Filenames are not changed.</p>
          ${state?.canWrite === false ? html`<p>Write permission is required to replace text.</p>` : nothing}
          ${this._confirming && this.canReplace ? html`
            <div class="browse-replace-confirmation">
              <p>Replace <strong>${state.term}</strong> with
                <strong>${this._replacement || '(empty text)'}</strong> in up to
                ${state.count} ${state.count === 1 ? 'file' : 'files'}?
                This saves changes to the source files.</p>
              <div class="browse-replace-actions">
                <button type="button" class="da-btn-secondary" @click=${this.cancelReplacement}>Cancel</button>
                <button type="button" class="da-btn-primary" @click=${this.confirmReplacement}>Confirm replace</button>
              </div>
            </div>` : html`
            <button type="submit" class="da-btn-secondary" ?disabled=${!this.canReplace}>Review replacement</button>`}
        </form>
        <p role="status" aria-atomic="true">${this.replacementSummary}</p>
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
