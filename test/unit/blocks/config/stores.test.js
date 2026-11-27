import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const {
  config, file, library, inFile, inherits, sheetFor, locate, readFile, save, sheetUrl,
} = await import('../../../../blocks/config/stores.js');

const multi = (name, rows) => ({ [name]: { data: rows }, ':names': [name], ':type': 'multi-sheet' });
const registered = (title, path) => multi('library', [{ title, path }]);
const { sectionById } = await import('../../../../blocks/config/sections.js');
const placeholders = sectionById('placeholders').store;

// Answers source reads with `sources[path]` (404 when absent) and records every request.
function mockFetch(sources = {}) {
  const calls = [];
  window.fetch = async (url, opts = {}) => {
    const href = String(url);
    const method = (opts.method ?? 'GET').toUpperCase();
    calls.push({ href, method });
    const src = href.match(/\/source\/[^/]+\/[^/]+(\/[^?]*)/);
    if (method !== 'GET') return new Response('', { status: 200 });
    if (src && src[1] in sources) {
      const value = sources[src[1]];
      return typeof value === 'number' ? new Response('', { status: value }) : new Response(JSON.stringify(value));
    }
    return new Response('', { status: 404 });
  };
  return calls;
}

describe('config stores', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  const ctx = { org: 'o', site: 's', siteConfig: null };

  it('builds the three kinds of store', () => {
    expect(config('flags')).to.deep.equal({ type: 'config', sheet: 'flags', inherit: true });
    expect(config('apps', { inherit: false }).inherit).to.equal(false);
    expect(file('/.da/x.json', { a: 'config' })).to.deep.equal({ type: 'file', path: '/.da/x.json', sheets: { a: 'config' } });
    expect(library('Icons')).to.deep.equal({ type: 'library', title: 'Icons', paths: ['/docs/library/icons.json', '/library/icons.json'] });
    expect(library('Placeholders', ['/placeholders.json']).paths).to.deep.equal(['/placeholders.json']);
  });

  it('tells file-backed stores and inheritance apart', () => {
    expect([config('data'), file('/f.json', {}), library('Icons')].map(inFile)).to.deep.equal([false, true, true]);
    expect([config('data'), config('apps', { inherit: false }), file('/f.json', {}), library('Icons')].map(inherits))
      .to.deep.equal([true, false, false, false]);
  });

  it('picks the sheet: the config sheet, the part tab, or the list file first sheet', () => {
    expect(sheetFor(config('flags'))).to.equal('flags');
    expect(sheetFor(file('/f.json', { languages: 'languages' }), { part: { id: 'languages' } })).to.equal('languages');
    expect(sheetFor(library('Icons'), { json: multi('icons', []) })).to.equal('icons');
    expect(sheetFor(library('Icons'), { json: null })).to.equal('data');
  });

  it('opens the config, or a file sheet once it exists', () => {
    expect(sheetUrl(config('data'), { org: 'o', site: null })).to.equal('/config#/o/');
    expect(sheetUrl(config('apps'), { org: 'o', site: 's' })).to.equal('/config#/o/s/');
    const located = { status: 'ok', path: '/docs/library/blocks.json', missing: false };
    expect(sheetUrl(library('Blocks'), { org: 'o', site: 's', located })).to.equal('/sheet#/o/s/docs/library/blocks');
    expect(sheetUrl(library('Blocks'), { org: 'o', site: 's', located: { ...located, missing: true } })).to.equal(null);
    expect(sheetUrl(file('/f.json', {}), { org: 'o', site: 's', located: { status: 'loading' } })).to.equal(null);
  });

  describe('locate', () => {
    it('uses the fixed path of a file store', () => {
      expect(locate(file('/.da/translate.json', {}), ctx)).to.deep.equal({ status: 'ready', path: '/.da/translate.json', registered: null });
    });

    it('needs a library row in the site config', () => {
      expect(locate(library('Icons'), ctx)).to.deep.equal({ status: 'unregistered' });
    });

    it('resolves a registered library to a file of this site, or reports it external', () => {
      const siteConfig = registered('Icons', 'https://content.da.live/o/s/library/icons.json');
      expect(locate(library('Icons'), { ...ctx, siteConfig })).to.deep.equal({ status: 'ready', path: '/library/icons.json', registered: 'https://content.da.live/o/s/library/icons.json' });
      const external = registered('Icons', 'https://example.com/icons.json');
      expect(locate(library('Icons'), { ...ctx, siteConfig: external }).status).to.equal('external');
    });
  });

  describe('readFile', () => {
    for (const id of ['blocks', 'templates', 'icons']) {
      const { store } = sectionById(id);
      const [primary, fallback] = store.paths;

      it(`discovers ${id} in precedence order and reads the chosen file only once`, async () => {
        const json = multi('items', [{ key: 'first' }]);
        const calls = mockFetch({ [primary]: json, [fallback]: multi('items', [{ key: 'second' }]) });
        const found = await readFile(store, ctx);
        expect(found).to.deep.equal({ status: 'ok', path: primary, registered: null, json, missing: false });
        expect(calls.filter((c) => c.href.includes('/source/')).map((c) => c.method)).to.deep.equal(['GET']);
        expect(sheetFor(store, { json: found.json })).to.equal('items');
      });

      it(`discovers ${id} in the fallback directory when the primary is absent`, async () => {
        const json = multi('items', [{ key: 'fallback' }]);
        const calls = mockFetch({ [fallback]: json });
        const found = await readFile(store, ctx);
        expect([found.status, found.path, found.json]).to.deep.equal(['ok', fallback, json]);
        const sources = calls.filter((c) => c.href.includes('/source/'));
        expect(sources.length).to.equal(2);
        expect(sources[0].href).to.include(primary);
        expect(sources[1].href).to.include(fallback);
        expect(calls.every((c) => c.method === 'GET')).to.equal(true);
      });
    }

    it('offers setup only when all candidate library files are absent', async () => {
      const calls = mockFetch({});
      expect(await readFile(library('Icons'), ctx)).to.deep.equal({ status: 'unregistered' });
      expect(calls.filter((c) => c.href.includes('/source/')).length).to.equal(2);
    });

    it('stops discovery on read failures instead of treating them as missing files', async () => {
      const store = library('Icons');
      const [primary, fallback] = store.paths;
      let calls = mockFetch({ [primary]: 403, [fallback]: multi('data', []) });
      expect(await readFile(store, ctx)).to.deep.equal({ status: 'error', path: primary, httpStatus: 403 });
      expect(calls.filter((c) => c.href.includes('/source/')).length).to.equal(1);
      calls = mockFetch({ [fallback]: 500 });
      expect(await readFile(store, ctx)).to.deep.equal({ status: 'error', path: fallback, httpStatus: 500 });
      expect(calls.filter((c) => c.href.includes('/source/')).length).to.equal(2);
    });

    it('does not replace a missing explicitly registered library with a discovered default', async () => {
      const store = library('Templates');
      const calls = mockFetch({ [store.paths[0]]: multi('data', [{ key: 'default' }]) });
      const siteConfig = registered('Templates', '/custom/templates.json');
      const found = await readFile(store, { ...ctx, siteConfig });
      expect([found.path, found.registered, found.missing]).to.deep.equal([
        '/custom/templates.json', '/custom/templates.json', true,
      ]);
      expect(calls.filter((c) => c.href.includes('/source/')).length).to.equal(1);
    });

    it('discovers existing placeholders without writing or requiring library registration', async () => {
      const json = multi('default', [{ Key: 'read-more', Text: 'Read more' }]);
      const calls = mockFetch({ '/placeholders.json': json });
      const found = await readFile(placeholders, ctx);
      expect(found).to.deep.equal({ status: 'ok', path: '/placeholders.json', registered: null, json, missing: false });
      expect(calls.every((c) => c.method === 'GET')).to.equal(true);
      expect(calls.filter((c) => c.href.includes('/source/')).length).to.equal(1);
      expect(sheetFor(placeholders, { json: found.json })).to.equal('default');
    });

    it('still offers setup for absent placeholders and surfaces discovery failures', async () => {
      mockFetch({});
      expect(await readFile(placeholders, ctx)).to.deep.equal({ status: 'unregistered' });
      for (const httpStatus of [401, 403, 500]) {
        mockFetch({ '/placeholders.json': httpStatus });
        // eslint-disable-next-line no-await-in-loop
        const failed = await readFile(placeholders, ctx);
        expect([failed.status, failed.httpStatus, failed.path]).to.deep.equal(['error', httpStatus, '/placeholders.json']);
      }
    });

    it('prefers explicit placeholder registration over the conventional file', async () => {
      const json = multi('data', [{ Key: 'custom', Text: 'Custom text' }]);
      const calls = mockFetch({ '/custom.json': json });
      const siteConfig = registered('Placeholders', '/custom.json');
      const found = await readFile(placeholders, { ...ctx, siteConfig });
      expect([found.path, found.registered, found.json]).to.deep.equal(['/custom.json', '/custom.json', json]);
      expect(calls.length).to.equal(1);
      expect(calls[0].href).to.include('/custom.json');
      const external = registered('Placeholders', 'https://example.com/placeholders.json');
      expect((await readFile(placeholders, { ...ctx, siteConfig: external })).status).to.equal('external');
      expect(calls.length).to.equal(1);
    });

    it('reads the file, or starts empty when it does not exist yet', async () => {
      const json = multi('config', [{ key: 'k', value: 'v' }]);
      mockFetch({ '/.da/translate.json': json });
      const found = await readFile(file('/.da/translate.json', {}), ctx);
      expect([found.status, found.missing, found.json]).to.deep.equal(['ok', false, json]);

      mockFetch({});
      const missing = await readFile(file('/.da/translate.json', {}), ctx);
      expect([missing.status, missing.missing, missing.json]).to.deep.equal(['ok', true, null]);
    });

    it('reports read failures with their status', async () => {
      mockFetch({ '/.da/translate.json': 500 });
      const failed = await readFile(file('/.da/translate.json', {}), ctx);
      expect([failed.status, failed.httpStatus, failed.path]).to.deep.equal(['error', 500, '/.da/translate.json']);
    });

    it('does not read or discover defaults for an external registered library', async () => {
      const calls = mockFetch({});
      const siteConfig = registered('Icons', 'https://example.com/icons.json');
      const result = await readFile(library('Icons'), { ...ctx, siteConfig });
      expect([result.status, calls.length]).to.deep.equal(['external', 0]);
    });
  });

  describe('save', () => {
    const mutate = () => ({ config: multi('data', [{ key: 'k', value: 'v' }]), changed: true });

    it('writes config stores to the config and file stores to the source file', async () => {
      const calls = mockFetch({});
      await save(config('data'), { org: 'o', site: 's' }, mutate);
      expect(calls.find((c) => c.method !== 'GET').href).to.match(/\/config\/o\/s\//);

      const fileCalls = mockFetch({});
      await save(file('/.da/translate.json', {}), { org: 'o', site: 's', path: '/.da/translate.json' }, mutate);
      expect(fileCalls.find((c) => c.method !== 'GET').href).to.match(/\/source\/o\/s\/\.da\/translate\.json/);
    });
  });
});
