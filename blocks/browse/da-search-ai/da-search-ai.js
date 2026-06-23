import { LitElement, html, nothing } from 'da-lit';
import { getNx, sanitizePathParts } from '../../../scripts/utils.js';
import { fetchDaConfigs, getFirstSheet } from '../../shared/utils.js';

// Styles
const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const STYLE = await loadStyle(import.meta.url);

const AI_KEY = 'aem.contentai.key';

const ICONS = {
  folder: '/img/icons/s2-icon-folder-20-n.svg',
  file: '/img/icons/s2-icon-filetext-20-n.svg',
  json: '/img/icons/s2-icon-data-20-n.svg',
  jpg: '/img/icons/s2-icon-image-20-n.svg',
  jpeg: '/img/icons/s2-icon-image-20-n.svg',
  png: '/img/icons/s2-icon-image-20-n.svg',
  svg: '/img/icons/s2-icon-image-20-n.svg',
  gif: '/img/icons/s2-icon-image-20-n.svg',
  avif: '/img/icons/s2-icon-image-20-n.svg',
  webp: '/img/icons/s2-icon-image-20-n.svg',
  mp4: '/img/icons/s2-icon-video-20-n.svg',
  pdf: '/img/icons/s2-icon-acrobatsolid-20-n.svg',
};

function getIconPath(id) {
  const ext = id?.split('.').pop()?.toLowerCase();
  return ICONS[ext] || ICONS.file;
}

function getResultPath(id) {
  const path = id.startsWith('/') ? id : `/${id}`;
  if (path.endsWith('.html')) return `/canvas#${path.replace(/\.html$/, '')}`;
  if (path.endsWith('.json')) return `/sheet#${path.replace(/\.json$/, '')}`;
  return `/media#${path}`;
}

const SEARCH_ENDPOINT = 'https://author-p102255-e236944-cmstg.adobeaemcloud.com/adobe/experimental/aemcontentai-expires-20261231/contentAI/content-sources/search';

const ROUTING_HEADER = JSON.stringify({
  cluster: 'ethos14-stage-va7',
  namespace: 'ns-team-aem-cm-stg-n117418',
  bucket: 'p102255-e236944',
  tier: 'author',
});

const CONTENT_SOURCE = 'da-summit-portal-2';

const STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  RESULTS: 'results',
  EMPTY: 'empty',
  ERROR: 'error',
};

export default class DaSearchAi extends LitElement {
  static properties = {
    fullpath: { type: String },
    _query: { state: true },
    _results: { state: true },
    _status: { state: true },
    _aiKey: { state: true },
  };

  constructor() {
    super();
    this._query = '';
    this._results = [];
    this._status = STATUS.IDLE;
    this._aiKey = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [STYLE];
  }

  update(props) {
    if (props.has('fullpath') && this.fullpath) {
      this.loadConfig();
    }
    super.update(props);
  }

  async loadConfig() {
    const [org, site] = sanitizePathParts(this.fullpath);
    if (!org || !site) return;

    const configs = await Promise.all(fetchDaConfigs({ org, site }));
    // merge org + site rows; site values override org values (reverse order)
    const rows = configs.filter(Boolean).reverse().flatMap((c) => getFirstSheet(c) || []);
    const entry = rows.find((row) => row.key === AI_KEY);
    this._aiKey = entry?.value?.trim() || null;
  }

  /**
   * AI search API call.
   * @param {string} query - The search query
   * @returns {Promise<Array>} Array of result objects { title, path, score }
   */
  async searchAi(query) {
    if (!this._aiKey) throw new Error('No AI search key configured (aem.contentai.key missing).');

    const body = {
      contentSource: { name: CONTENT_SOURCE },
      query: {
        type: 'composite',
        operator: 'OR',
        queries: [
          {
            type: 'vector',
            text: query,
            options: {
              vectorSpaceSelection: { space: 'semantic' },
              numCandidates: 100,
              boost: 1.0,
              similarity: 0.5,
            },
          },
          {
            type: 'fulltext',
            text: query,
            options: {
              lexicalSpaceSelection: { space: 'lexical' },
              boost: 1.2,
              operator: 'AND',
            },
          },
        ],
      },
      queryOptions: { resultFields: { includes: ['title'] } },
    };

    const resp = await fetch(SEARCH_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-adobe-routing': ROUTING_HEADER,
        'x-api-key': this._aiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) throw new Error(`Search API error: ${resp.status}`);
    const data = await resp.json();

    // Map API hits to internal shape { title, path, score }
    const hits = data.hits ?? data.results ?? data.items ?? [];
    return hits.map((hit) => ({
      title: hit.data?.title ?? hit.id,
      path: hit.id ?? '',
      score: hit.score ?? null,
    }));
  }

  async handleSearch(e) {
    e.preventDefault();
    const [input] = e.target.elements;
    const query = input.value.trim();
    if (!query || !this._aiKey) return;

    this._query = query;
    this._results = [];
    this._status = STATUS.LOADING;

    try {
      const results = await this.searchAi(query);
      this._results = results;
      this._status = results.length ? STATUS.RESULTS : STATUS.EMPTY;
    } catch {
      this._status = STATUS.ERROR;
    }
  }

  handleClear() {
    this._query = '';
    this._results = [];
    this._status = STATUS.IDLE;
    const input = this.shadowRoot.querySelector('input[type="text"]');
    if (input) {
      input.value = '';
      input.focus();
    }
  }

  renderSearchForm() {
    return html`
      <form @submit=${this.handleSearch} role="search">
        <div class="search-input-wrapper">
          <input
            type="text"
            placeholder="Ask a question or enter a search term"
            name="query"
            aria-label="AI search query"
            ?disabled=${this._status === STATUS.LOADING} />
          ${this._query ? html`
            <button
              type="button"
              class="clear-btn"
              @click=${this.handleClear}
              aria-label="Clear search">✕</button>
          ` : nothing}
        </div>
        <button
          type="submit"
          class="search-btn"
          ?disabled=${this._status === STATUS.LOADING || !this._aiKey}
          aria-label="Search">
          ${this._status === STATUS.LOADING ? 'Searching…' : 'Search'}
        </button>
      </form>
    `;
  }

  renderResultItem(result) {
    return html`
      <li class="result-item">
        <span class="result-icon">
          <svg viewBox="0 0 20 20"><use href="${getIconPath(result.path)}#icon"></svg>
        </span>
        <div class="result-body">
          <a href="${getResultPath(result.path)}" class="result-title">${result.title || result.path}</a>
          <span class="result-path">${result.path}</span>
        </div>
      </li>
    `;
  }

  renderResults() {
    return html`
      <section class="results-area" aria-label="Search results" aria-live="polite">
        ${this._status === STATUS.IDLE && !this._aiKey ? html`
          <p class="results-placeholder results-no-key">AI search is not configured. Add an <code>aem.contentai.key</code> to your site or org config.</p>
        ` : nothing}
        ${this._status === STATUS.IDLE && this._aiKey ? html`
          <p class="results-placeholder">Enter a query above to start an AI-powered search.</p>
        ` : nothing}
        ${this._status === STATUS.LOADING ? html`
          <p class="results-loading">
            <span class="loading-spinner" aria-hidden="true"></span>
            Searching for "<strong>${this._query}</strong>"…
          </p>
        ` : nothing}
        ${this._status === STATUS.EMPTY ? html`
          <p class="results-empty">No results found for "<strong>${this._query}</strong>".</p>
        ` : nothing}
        ${this._status === STATUS.ERROR ? html`
          <p class="results-error">Something went wrong. Please try again.</p>
        ` : nothing}
        ${this._status === STATUS.RESULTS ? html`
          <p class="results-summary">${this._results.length} result${this._results.length !== 1 ? 's' : ''} for "<strong>${this._query}</strong>"</p>
          <ul class="results-list">
            ${this._results.map((result) => this.renderResultItem(result))}
          </ul>
        ` : nothing}
      </section>
    `;
  }

  render() {
    return html`
      ${this.renderSearchForm()}
      ${this.renderResults()}
    `;
  }
}

customElements.define('da-search-ai', DaSearchAi);
