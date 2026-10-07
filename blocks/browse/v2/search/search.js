import { getNx, getNx2Api } from '../../../../scripts/utils.js';
import { getSearchPattern, getMatchContext } from './utils.js';
import { getSearchScope, timeoutWrapper } from '../../shared/search.js';

const { crawl, Queue } = await import(`${getNx()}/public/utils/tree.js`);

const SOURCE_TYPES = { html: 'text/html', json: 'application/json', svg: 'image/svg+xml' };

export default class SearchEngine extends EventTarget {
  constructor() {
    super();
    this.setDefault();
    this._caseSensitive = true;
  }

  cancelSearch() {
    this._cancelCrawl?.();
    this._cancelCrawl = undefined;
    this._searchRun = undefined;
  }

  get caseSensitive() {
    return this._caseSensitive;
  }

  set caseSensitive(value) {
    this._caseSensitive = value;
  }

  updateList() {
    const opts = { detail: { items: this._items }, bubbles: true, composed: true };
    const event = new CustomEvent('updated', opts);
    this.dispatchEvent(event);
  }

  setDefault() {
    this.cancelSearch();
    this._searchRun = {};
    this._term = undefined;
    this._items = [];
    this._total = 0;
    this._matches = 0;
    this._time = null;
    this._replaceErrors = undefined;
  }

  async getSearchScope(startPath) {
    return getSearchScope({
      startPath,
      getBrowseItems: () => this.browseItems,
    });
  }

  async getMatches(startPath, term) {
    const run = this._searchRun;
    const pattern = getSearchPattern({ term, caseSensitive: this._caseSensitive });
    const searchTypes = Object.keys(SOURCE_TYPES).map((ext) => `.${ext}`);

    const searchFile = async (file, prevRetry = 0) => {
      if (this._searchRun !== run) return;
      if (!searchTypes.some((type) => file.path.endsWith(type))) return;

      let retryCount = prevRetry;
      if (retryCount === 0) this._total += 1;

      const getFile = async () => {
        let matchContext;

        try {
          const { source } = await getNx2Api();
          const resp = await source.get(file.path);
          if (!resp.ok) throw new Error(`Could not read file (${resp.status}).`);
          const text = await resp.text();
          if (this._searchRun !== run) return file;
          // Log empty files
          // eslint-disable-next-line no-console
          if (text.length < 2) console.log(file.path);
          const filename = file.path.split('/').pop();
          matchContext = getMatchContext({ text, filename, pattern });
        } catch {
          return { error: 'fetch error' };
        }

        if (this._searchRun === run
          && (matchContext.snippets.length || matchContext.filenameMatch)) {
          this._matches += 1;
          this._items = [...this._items, {
            ...file,
            name: file.path.replace(`.${file.ext}`, '').replace(this.fullpath, ''),
            matchContext,
          }];
          this.updateList();
        }

        return file;
      };

      const result = await this.timeoutWrapper(getFile);

      if (result?.error && retryCount <= 3 && this._searchRun === run) {
        // eslint-disable-next-line no-console
        console.log(`retrying due to ${result.error}: ${file.path}`);
        retryCount += 1;
        await searchFile(file, retryCount);
      }
    };

    const { paths, files } = await this.getSearchScope(startPath);
    if (this._searchRun !== run) return;
    const crawling = crawl({ path: paths, callback: searchFile, throttle: 10, files });
    this._cancelCrawl = crawling.cancelCrawl;
    await crawling.results;
  }

  async search(startPath, term) {
    const run = this._searchRun;
    this._term = term;
    performance.mark('start-search');
    await this.getMatches(startPath, term);
    if (this._searchRun !== run) return;
    performance.mark('end-search');

    const timestamp = Date.now();
    performance.measure(`search-${timestamp}`, 'start-search', 'end-search');
    const searchTime = performance.getEntriesByName(`search-${timestamp}`)[0].duration;
    this._time = String(searchTime / 1000).substring(0, 4);
  }

  timeoutWrapper(fn, timeout = 30000) {
    return timeoutWrapper({ fn, timeout });
  }

  async replaceMatches({ replacement }) {
    const run = this._searchRun;
    if (!run) return { cancelled: true };
    if (!this._term || typeof replacement !== 'string') {
      throw new Error('A search query and replacement text are required.');
    }
    const pattern = getSearchPattern({ term: this._term, caseSensitive: this._caseSensitive });
    this._time = null;
    this._total = this._matches;
    this._matches = 0;
    this._replaceErrors = [];
    performance.mark('start-replace');

    const replaceFile = async (file) => {
      if (this._searchRun !== run) return { cancelled: true };
      try {
        const { source } = await getNx2Api();
        const getResp = await source.get(file.path);
        if (!getResp.ok) throw new Error(`Could not read file (${getResp.status}).`);
        const text = await getResp.text();
        if (this._searchRun !== run) return { cancelled: true };
        const replacedText = text.replaceAll(pattern, () => replacement);
        if (replacedText === text) return { skipped: true };
        const ext = file.path.split('.').pop();
        const type = Object.hasOwn(SOURCE_TYPES, ext) ? SOURCE_TYPES[ext] : undefined;
        if (!type) throw new Error('Unsupported source file type.');
        const blob = new Blob([replacedText], { type });
        const postResp = await source.save(file.path, { body: blob });
        if (!postResp.ok) throw new Error(`Could not save file (${postResp.status}).`);
        if (this._searchRun === run) this._matches += 1;
        return { replaced: true };
      } catch (error) {
        return { path: file.path, error: error.message };
      }
    };

    const results = [];
    const queue = new Queue(async (file) => {
      results.push(await replaceFile(file));
    }, 10);
    await Promise.all(this._items.map((match) => queue.push(match)));
    if (this._searchRun !== run) return { cancelled: true };
    this._replaceErrors = results.filter((result) => result?.error);

    performance.mark('end-replace');
    const timestamp = Date.now();
    performance.measure(`replace-${timestamp}`, 'start-replace', 'end-replace');
    const replaceTime = performance.getEntriesByName(`replace-${timestamp}`)[0].duration;
    this._time = String(replaceTime / 1000).substring(0, 4);
    return {
      replaced: this._matches,
      skipped: results.filter((result) => result?.skipped).length,
      errors: this._replaceErrors,
    };
  }
}
