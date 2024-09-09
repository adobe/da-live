import { LitElement, html, nothing } from 'da-lit';
import { DA_ORIGIN } from '../../shared/constants.js';
import { getNx } from '../../../scripts/utils.js';
import { daFetch } from '../../shared/utils.js';

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
    this._total = 0;
    this._matches = 0;
    this._time = null;
  }

  async searchFile(file, term) {
    const resp = await daFetch(`${DA_ORIGIN}/source${file.path}`);
    if (!resp.ok) return null;
    const text = await resp.text();
    const path = file.ext ? file.path.replace(`.${file.ext}`, '') : file.path;
    return { ...file, name: path.replace(this.fullpath, ''), match: text.includes(term) };
  }

  async getMatches(path, term) {
    let folders = [path];
    while (folders.length > 0) {
      // eslint-disable-next-line no-loop-func
      const searchFolders = folders.map(async (currentPath) => {
        const resp = await daFetch(`${DA_ORIGIN}/list${currentPath}`);
        if (!resp.ok) return [];
        const json = await resp.json();
        const searchFolderItems = json.map(async (item) => {
          if (item.ext === 'html' || item.ext === 'json') {
            this._total += 1;
            const file = await this.searchFile(item, term);
            if (file.match) {
              this._matches += 1;
              this._items = [...this._items, file];
              this.updateList();
            }
          }
          if (!item.ext) return item.path;
          return null;
        });

        const newFolders = await Promise.all(searchFolderItems);
        return newFolders.filter(Boolean);
      });
      const childFolders = await Promise.all(searchFolders);
      folders = childFolders.flat();
    }
  }

  async search(startPath, term) {
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

  async handleReplace(e) {
    e.preventDefault();
    const [replace] = e.target.elements;
    if (!replace.value) return;

    this._time = null;
    this._action = 'Replaced';
    this._total = this._matches;
    this._matches = 0;
    performance.mark('start-replace');

    const replaced = this._items.map((match) => new Promise((resolve) => {
      (async () => {
        const resp = await daFetch(`${DA_ORIGIN}/source${match.path}`);
        if (!resp.ok) return;
        const text = await resp.text();
        const replacedText = text.replaceAll(this._term, replace.value);
        const blob = new Blob([replacedText], { type: 'text/html' });
        const formData = new FormData();
        formData.append('data', blob);
        const opts = { method: 'PUT', body: formData };
        const daResp = await daFetch(`${DA_ORIGIN}/source${match.path}`, opts);
        if (!daResp.ok) return;
        this._matches += 1;
        resolve();
      })();
    }));
    await Promise.all(replaced);
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
