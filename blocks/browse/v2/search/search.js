import { getNx, getNx2Api } from '../../../../scripts/utils.js';
import { getSearchPattern, getMatchContext } from './utils.js';
import {
  getSearchScope,
  withRetry,
  isSearchable,
  getResultName,
} from '../../shared/search.js';

const { crawl, Queue } = await import(`${getNx()}/public/utils/tree.js`);

const FLUSH_DELAY = 50;
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
    clearTimeout(this._flushTimer);
    this._flushTimer = undefined;
    const opts = { detail: { items: [...this._items] }, bubbles: true, composed: true };
    this.dispatchEvent(new CustomEvent('updated', opts));
  }

  scheduleUpdate() {
    this._flushTimer ??= setTimeout(() => this.updateList(), FLUSH_DELAY);
  }

  setDefault() {
    this.cancelSearch();
    clearTimeout(this._flushTimer);
    this._flushTimer = undefined;
    this._searchRun = {};
    this._term = undefined;
    this._items = [];
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
    const { source } = await getNx2Api();

    const searchFile = async (file) => {
      if (this._searchRun !== run) return;
      if (!isSearchable(file.path)) return;

      const getFile = async () => {
        let matchContext;

        try {
          const resp = await source.get(file.path);
          if (!resp.ok) return { error: 'fetch error' };
          const text = await resp.text();
          if (this._searchRun !== run) return file;
          const filename = file.path.split('/').pop();
          matchContext = getMatchContext({ text, filename, pattern });
        } catch {
          return { error: 'fetch error' };
        }

        if (this._searchRun === run
          && (matchContext.snippets.length || matchContext.filenameMatch)) {
          this._items.push({
            ...file,
            name: getResultName(file, this.fullpath),
            matchContext,
          });
          this.scheduleUpdate();
        }

        return file;
      };

      await withRetry({
        fn: getFile,
        path: file.path,
        retries: 4,
        isCancelled: () => this._searchRun !== run,
      });
    };

    const { paths, files } = await this.getSearchScope(startPath);
    if (this._searchRun !== run) return;
    const crawling = crawl({ path: paths, callback: searchFile, throttle: 10, files });
    this._cancelCrawl = crawling.cancelCrawl;
    await crawling.results;
    if (this._searchRun === run && this._flushTimer) this.updateList();
  }

  async search(startPath, term) {
    this._term = term;
    await this.getMatches(startPath, term);
  }

  async replaceMatches({ replacement }) {
    const run = this._searchRun;
    if (!run) return { cancelled: true };
    if (!this._term || typeof replacement !== 'string') {
      throw new Error('A search query and replacement text are required.');
    }
    const pattern = getSearchPattern({ term: this._term, caseSensitive: this._caseSensitive });
    const { source } = await getNx2Api();
    let replaced = 0;
    let skipped = 0;
    const errors = [];

    const replaceFile = async (file) => {
      if (this._searchRun !== run) return { cancelled: true };
      let message;
      const fn = async () => {
        try {
          const getResp = await source.get(file.path);
          if (!getResp.ok) throw new Error(`Could not read file (${getResp.status}).`);
          const text = await getResp.text();
          if (this._searchRun !== run) return { cancelled: true };
          const replacedText = text.replaceAll(pattern, () => replacement);
          if (replacedText === text) return { skipped: true };
          const postResp = await source.save(file.path, { body: new Blob([replacedText]) });
          if (!postResp.ok) return { error: `Could not save file (${postResp.status}).` };
          return { replaced: true };
        } catch (error) {
          message = error.message;
          throw error;
        }
      };
      // Only thrown read failures are retried, never timeouts or save errors
      const result = await withRetry({
        fn,
        path: file.path,
        timeout: 60000,
        retries: 3,
        shouldRetry: (res) => res?.error === 'bad result',
        isCancelled: () => this._searchRun !== run,
      });
      return result.error ? { path: file.path, error: message || result.error } : result;
    };

    const queue = new Queue(async (file) => {
      const result = await replaceFile(file);
      if (result.replaced) replaced += 1;
      else if (result.skipped) skipped += 1;
      else if (result.error) errors.push(result);
    }, 10);
    const targets = this._items.filter((item) => item.matchContext?.snippets.length);
    await Promise.all(targets.map((match) => queue.push(match)));
    if (this._searchRun !== run) return { cancelled: true };
    return { replaced, skipped, errors };
  }
}
