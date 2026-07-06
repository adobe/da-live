import { LitElement, html, nothing } from 'da-lit';
import { getNx, getNx2Api } from '../../../scripts/utils.js';

const { crawl, Queue } = await import(`${getNx()}/public/utils/tree.js`);

// Styles & shared components
const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
await import(`${getNx()}/blocks/shared/popover/popover.js`);
const [base, STYLE] = await Promise.all([
  loadStyle(new URL('../../shared/styles/base.css', import.meta.url).href),
  loadStyle(import.meta.url),
]);

const DEFAULT_LOCALES = ['langstore'];

function getLocales(translate) {
  const locales = new Set(DEFAULT_LOCALES);

  translate?.languages?.data?.forEach((lang) => {
    lang.locales?.split(',').forEach((loc) => {
      const dir = loc.split('/').find((part) => part?.trim() !== '');
      if (dir) {
        locales.add(dir.trim());
      }
    });
  });

  return locales;
}

export default class DaSearch extends LitElement {
  static properties = {
    fullpath: { type: String },
    browseItems: { type: Array },
    _items: { state: true },
    _suggestions: { state: true },
    _searching: { state: true },
    _inputDirty: { state: true },
    _replaceStatus: { state: true },
    showReplace: { state: true },
    _caseSensitive: { state: true },
  };

  constructor() {
    super();
    this._items = [];
    this._suggestions = [];
    this._caseSensitive = true;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [base, STYLE];
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this._replaceStatusTimer);
  }

  update(props) {
    if (props.has('fullpath') && props.get('fullpath') !== this.fullpath) {
      this.setDefault();
      this.updateComplete.then(() => this.updateList());
    }
    super.update(props);
  }

  get statusText() {
    if (!this._total) return null;
    const count = `${this._action} ${this._matches} of ${this._total}`;
    return this._time ? `${count} in ${this._time}s` : `${count}…`;
  }

  updateList() {
    const detail = { items: this._items, status: this.statusText };
    const event = new CustomEvent('updated', { detail, bubbles: true, composed: true });
    this.dispatchEvent(event);
  }

  get _popover() {
    return this.shadowRoot?.querySelector('nx-popover');
  }

  setDefault() {
    this._items = [];
    this._suggestions = [];
    this._hidePopover();
    this._total = 0;
    this._matches = 0;
    this._time = null;
    this._inputDirty = false;
  }

  getSuggestions(term) {
    if (!term || !this.browseItems?.length) return [];
    const lower = term.toLowerCase();

    return this.browseItems
      .filter((item) => item.name.toLowerCase().includes(lower))
      .slice(0, 8);
  }

  selectSuggestion(item) {
    this._suggestions = [];
    this._hidePopover();
    this.dispatchEvent(new CustomEvent('suggestion-selected', {
      detail: { item },
      bubbles: true,
      composed: true,
    }));
  }

  handleInput(e) {
    this._inputDirty = true;
    const { value } = e.target;
    this._suggestions = this.getSuggestions(value);
    if (value) this._showPopover();
    else this._hidePopover();
  }

  handleSearchKeydown(e) {
    if (e.key === 'ArrowDown' && this._popover?.open) {
      e.preventDefault();
      const first = this.shadowRoot.querySelector('.da-suggestions button')
        ?? this.shadowRoot.querySelector('.da-search-more');
      first?.focus();
    }
  }

  handleSearchMoreKeydown(e) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const last = [...(this.shadowRoot.querySelectorAll('.da-suggestions button'))].at(-1);
      if (last) last.focus();
      else this.shadowRoot.querySelector('input[type="search"]')?.focus();
    }
  }

  handleSearchMore() {
    this.shadowRoot.querySelector('.da-search-row').requestSubmit();
  }

  handleSuggestionKeydown(e, item) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.selectSuggestion(item);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = e.target.closest('li')?.nextElementSibling?.querySelector('button');
      if (next) next.focus();
      else this.shadowRoot.querySelector('.da-search-more')?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = e.target.closest('li')?.previousElementSibling?.querySelector('button');
      if (prev) prev.focus();
      else this.shadowRoot.querySelector('input[type="search"]')?.focus();
    }
  }

  _showPopover() {
    const pop = this._popover;
    if (!pop) return;
    const container = this.shadowRoot.querySelector('.da-search-container');
    pop.style.minWidth = `${container?.offsetWidth ?? 0}px`;
    if (pop.open) pop.reposition();
    else pop.show({ anchor: container });
  }

  _hidePopover() {
    this._popover?.close();
  }

  updated(changed) {
    if (changed.has('_suggestions') && this._popover?.open) {
      this._popover.reposition();
    }
  }

  async getSearchScope(startPath) {
    const isSiteFolder = startPath.split('/').length === 3;
    if (!isSiteFolder) {
      return { paths: [startPath], files: [] };
    }

    const { source } = await getNx2Api();
    const resp = await source.get(`${startPath}/.da/translate.json`);
    if (!resp.ok) {
      return { paths: [startPath], files: [] };
    }

    const translate = await resp.json();
    const locales = getLocales(translate);

    if (!locales.size || !this.browseItems?.length) {
      return { paths: [startPath], files: [] };
    }

    const paths = [];
    const files = [];

    this.browseItems.forEach((item) => {
      if (!locales.has(item.name)) {
        if (item.ext) {
          files.push(item);
        } else {
          paths.push(item.path);
        }
      }
    });

    return { paths, files };
  }

  async getMatches(startPath, term) {
    const searchTypes = ['.html', '.json', '.svg'];

    const searchFile = async (file, prevRetry = 0) => {
      if (!searchTypes.some((type) => file.path.endsWith(type))) return;

      let retryCount = prevRetry;
      if (retryCount === 0) {
        this._total += 1;
        this.updateList();
      }

      const getFile = async () => {
        let match;

        try {
          const { source } = await getNx2Api();
          const resp = await source.get(file.path);
          const text = await resp.text();
          // Log empty files
          // eslint-disable-next-line no-console
          if (text.length < 2) console.log(file.path);
          const filename = file.path.split('/').pop();
          if (this._caseSensitive) {
            file.contentMatch = text.includes(term);
            match = file.contentMatch || filename.includes(term);
          } else {
            const lowerTerm = term.toLowerCase();
            file.contentMatch = text.toLowerCase().includes(lowerTerm);
            match = file.contentMatch || filename.toLowerCase().includes(lowerTerm);
          }
        } catch {
          return { error: 'fetch error' };
        }

        if (match) {
          this._matches += 1;
          file.name = file.path.replace(`.${file.ext}`, '').replace(this.fullpath, '');
          this._items = [...this._items, file];
          this.updateList();
        }

        return file;
      };

      const result = await this.timeoutWrapper(getFile);

      if (result.error && retryCount <= 3) {
        // eslint-disable-next-line no-console
        console.log(`retrying due to ${result.error}: ${file.path}`);
        retryCount += 1;
        await searchFile(file, retryCount);
      }
    };

    const { paths, files } = await this.getSearchScope(startPath);
    const { results } = crawl({ path: paths, callback: searchFile, throttle: 10, files });
    await results;
  }

  async search(startPath, term) {
    this._term = term;
    this._action = 'Found';
    this._searching = true;
    performance.mark('start-search');
    await this.getMatches(startPath, term);
    performance.mark('end-search');

    const timestamp = Date.now();
    performance.measure(`search-${timestamp}`, 'start-search', 'end-search');
    const searchTime = performance.getEntriesByName(`search-${timestamp}`)[0].duration;
    this._time = String(searchTime / 1000).substring(0, 4);
    this._searching = false;
    this._inputDirty = false;
    this.updateList();
  }

  async handleSearch(e) {
    e.preventDefault();
    this._suggestions = [];
    this._hidePopover();
    const [term] = e.target.elements;
    if (!term.value) {
      this.setDefault();
      this.updateList();
      this.dispatchEvent(new CustomEvent('search-cleared', { bubbles: true, composed: true }));
      return;
    }
    this.dispatchEvent(new CustomEvent('search-started', { bubbles: true, composed: true }));
    this.setDefault();
    this.updateList();
    this._term = term.value;
    this.search(this.fullpath, term.value);
  }

  timeoutWrapper(fn, timeout = 30000) {
    return new Promise((resolve) => {
      const loading = fn();

      const timedout = setTimeout(() => { resolve({ error: 'timeout' }); }, timeout);

      loading.then((result) => {
        clearTimeout(timedout);
        resolve(result);
      }).catch(() => {
        clearTimeout(timedout);
        resolve({ error: 'bad result' });
      });
    });
  }

  async handleReplace(e) {
    e.preventDefault();
    const [replace] = e.target.elements;
    if (!replace.value) return;

    clearTimeout(this._replaceStatusTimer);
    this._time = null;
    this._action = 'Replaced';
    this._total = this._matches;
    this._matches = 0;
    this._replaceStatus = `Replacing 0 of ${this._total}…`;
    performance.mark('start-replace');

    const replaceFile = async (file, prevRetry = 0) => {
      let retryCount = prevRetry;

      const getFile = async () => {
        if (!file.contentMatch) return file;
        const { source } = await getNx2Api();
        const getResp = await source.get(file.path);
        const text = await getResp.text();
        const escaped = this._term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const flags = this._caseSensitive ? 'g' : 'gi';
        const replacedText = text.replace(new RegExp(escaped, flags), replace.value);
        if (replacedText === text) return file;
        const blob = new Blob([replacedText], { type: 'text/html' });
        const postResp = await source.save(file.path, { body: blob });
        if (!postResp.ok) return { error: 'Error saving file' };
        this._matches += 1;
        this._replaceStatus = `Replacing ${this._matches} of ${this._total}…`;
        return file;
      };

      const result = await this.timeoutWrapper(getFile, 60000);

      // Only retry for true failures (not timeouts)
      if (result.error === 'bad result') {
        if (retryCount >= 3) {
          // eslint-disable-next-line no-console
          console.log('retry limit exceeded');
          return;
        }
        retryCount += 1;
        replaceFile(file, retryCount);
      }
    };

    const queue = new Queue(replaceFile);
    await Promise.all(this._items.map((match) => queue.push(match)));

    performance.mark('end-replace');
    const timestamp = Date.now();
    performance.measure(`replace-${timestamp}`, 'start-replace', 'end-replace');
    const replaceTime = performance.getEntriesByName(`replace-${timestamp}`)[0].duration;
    this._time = String(replaceTime / 1000).substring(0, 4);
    this._replaceStatus = `✓ Replaced ${this._matches}`;
    this._replaceStatusTimer = setTimeout(() => { this._replaceStatus = null; }, 2500);
  }

  toggleReplace() {
    this.showReplace = !this.showReplace;
  }

  async toggleCaseSensitive() {
    this._caseSensitive = !this._caseSensitive;
    if (this._term) {
      this.setDefault();
      this.updateList();
      await this.search(this.fullpath, this._term);
    }
  }

  render() {
    const folderName = this.fullpath?.split('/').pop() ?? 'folder';

    return html`
      <div class="da-search-container">
        <form @submit=${this.handleSearch} role="search" class="da-search-row">
          <span class="da-search-scope-pill" title=${folderName}>${folderName}</span>
          <input type="search" placeholder="Search" name="term" aria-label="Search in ${folderName}"
            aria-autocomplete="list" aria-haspopup="listbox" autocomplete="off"
            aria-expanded=${this._popover?.open ? 'true' : 'false'}
            aria-controls="da-search-suggestions"
            @input=${this.handleInput}
            @keydown=${this.handleSearchKeydown}/>
          <button
            type="button"
            class="case-toggle${this._caseSensitive ? ' active' : ''}"
            @click=${this.toggleCaseSensitive}
            aria-pressed=${this._caseSensitive}
            aria-label="Match case">Aa</button>
          <button
            type="button"
            class="replace-toggle${this.showReplace ? ' active' : ''}"
            @click=${this.toggleReplace}
            aria-pressed=${this.showReplace}
            aria-label="Toggle replace"></button>
        </form>
        ${this.showReplace ? html`
          <form @submit=${this.handleReplace} class="da-replace-row">
            <input type="text" placeholder="Replace with" name="replace" aria-label="Replacement text"/>
            <input class="da-btn-secondary" type="submit" value="Replace all" ?disabled=${!this._items.length || this._searching || this._inputDirty} />
          </form>` : nothing}
      </div>
      <nx-popover @close=${() => { this._suggestions = []; }}>
        ${this._suggestions.length > 0 ? html`
          <ul id="da-search-suggestions" class="da-suggestions" role="listbox">
            ${this._suggestions.map((item) => html`
              <li role="option">
                <button type="button" class="da-suggestion-item"
                  @click=${() => this.selectSuggestion(item)}
                  @keydown=${(e) => this.handleSuggestionKeydown(e, item)}>
                  <span class="da-suggestion-icon ${item.ext ? 'file' : 'folder'}"></span>
                  <span class="da-suggestion-name">${item.name}</span>
                </button>
              </li>
            `)}
          </ul>` : html`
          <p class="da-suggestions-empty">No matching entries found</p>`}
        <button type="button" class="da-search-more"
          @click=${this.handleSearchMore}
          @keydown=${this.handleSearchMoreKeydown}>
          Search more
        </button>
      </nx-popover>
      ${this._replaceStatus ? html`<p class="da-replace-status">${this._replaceStatus}</p>` : nothing}
    `;
  }
}

customElements.define('da-search', DaSearch);
