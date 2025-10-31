import { LitElement, html, nothing } from 'da-lit';
import { DA_ORIGIN } from '../../shared/constants.js';
import { getNx } from '../../../scripts/utils.js';
import { daFetch } from '../../shared/utils.js';

const { crawl, Queue } = await import(`${getNx()}/public/utils/tree.js`);

// Styles
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const STYLE = await getStyle(import.meta.url);

export default class DaSearch extends LitElement {
  static properties = {
    fullpath: { type: String },
    _term: { state: true },
    _total: { state: true },
    _matches: { state: true },
    _action: { state: true },
    _time: { state: true },
    _items: { state: true },
    showReplace: { state: true },
  };

  constructor() {
    super();
    this.setDefault();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [STYLE];
  }

  update(props) {
    if (props.has('fullpath') && props.get('fullpath') !== this.fullpath) {
      this.setDefault();
      this.updateList();
    }
    super.update(props);
  }

  updateList() {
    const opts = { detail: { items: this._items }, bubbles: true, composed: true };
    const event = new CustomEvent('updated', opts);
    this.dispatchEvent(event);
  }

  setDefault() {
    this._items = [];
    this._searchTotal = 0;
    this._searchQueue = [];
    this._total = 0;
    this._matches = 0;
    this._time = null;
  }

  async getMatches(startPath, term) {
    const searchTypes = ['.html', '.json', '.svg'];

    const searchFile = async (file, prevRetry = 0) => {
      if (!searchTypes.some((type) => file.path.endsWith(type))) return;

      let retryCount = prevRetry;
      if (retryCount === 0) this._total += 1;

      const getFile = async () => {
        let match;

        try {
          const resp = await daFetch(`${DA_ORIGIN}/source${file.path}`);
          const text = await resp.text();
          // Log empty files
          // eslint-disable-next-line no-console
          if (text.length < 2) console.log(file.path);
          match = text.includes(term) || file.path.split('/').pop().includes(term);
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

    const { results } = crawl({ path: startPath, callback: searchFile, throttle: 10 });
    await results;
  }

  async search(startPath, term) {
    this._term = term;
    this._action = 'Found';
    performance.mark('start-search');
    await this.getMatches(startPath, term);
    performance.mark('end-search');

    const timestamp = Date.now();
    performance.measure(`search-${timestamp}`, 'start-search', 'end-search');
    const searchTime = performance.getEntriesByName(`search-${timestamp}`)[0].duration;
    this._time = String(searchTime / 1000).substring(0, 4);
  }

  async handleSearch(e) {
    e.preventDefault();
    this.setDefault();
    const [term] = e.target.elements;
    if (!term.value) return;
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

    this._time = null;
    this._action = 'Replaced';
    this._total = this._matches;
    this._matches = 0;
    performance.mark('start-replace');

    const replaceFile = async (file, prevRetry = 0) => {
      let retryCount = prevRetry;

      const getFile = async () => {
        const getResp = await daFetch(`${DA_ORIGIN}/source${file.path}`);
        const text = await getResp.text();
        const replacedText = text.replaceAll(this._term, replace.value);
        const blob = new Blob([replacedText], { type: 'text/html' });
        const formData = new FormData();
        formData.append('data', blob);
        const opts = { method: 'PUT', body: formData };
        const postResp = await daFetch(`${DA_ORIGIN}/source${file.path}`, opts);
        if (!postResp.ok) return { error: 'Error saving file' };
        this._matches += 1;
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
  }

  get showText() {
    return this.matches && this._total;
  }

  get matchText() {
    return html`${this._action} ${this._matches} of ${this._total}`;
  }

  get timeText() {
    return html`${this._time ? html` in ${this._time} seconds.` : nothing}`;
  }

  async toggleReplace() {
    this.showReplace = !this.showReplace;
  }

  render() {
    return html`
      <form @submit=${this.handleSearch}>
        <input type="text" placeholder="Enter search" name="term"/>
        <input type="submit" value="Search" />
      </form>
      <p>${this.showText ? html`${this.matchText}${this.timeText}` : nothing}</p>
      <div class="replace-pane">
        <form class="da-replace-form${this.showReplace ? nothing : ' hide'}" @submit=${this.handleReplace}>
          <input type="text" placeholder="Enter replace text" name="replace"/>
          <input type="submit" value="Replace" />
        </form>
        <div class="checkbox-wrapper">
          <input id="show-replace" type="checkbox" name="item-selected" @click="${this.toggleReplace}">
          <label for="show-replace" class="checkbox-label"><span class="${this.showReplace ? 'hide' : nothing}">Replace</span></label>
        </div>
        <input type="checkbox" name="select" style="display: none;">
      </div>
    `;
  }
}

customElements.define('da-search', DaSearch);
