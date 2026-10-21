export class Queue {
  constructor(callback) {
    this.callback = callback;
    this.items = [];
  }

  async push(item) {
    this.items.push(item);
    await this.callback?.(item);
  }

  shift() { return this.items.shift(); }
}

// Default returns an empty results promise so callers using
// `const { results } = crawl(conf); await results;` still work.
// Tests can override via globalThis.__crawlMock.
export function crawl(conf) {
  if (typeof globalThis.__crawlMock === 'function') {
    return globalThis.__crawlMock(conf);
  }
  return { results: Promise.resolve([]) };
}
