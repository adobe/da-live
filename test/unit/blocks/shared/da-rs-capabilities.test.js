import { expect } from '@esm-bundle/chai';
import { setNx, getNx2Api } from '../../../../scripts/utils.js';
import { DA_ORIGIN } from '../../../../blocks/shared/constants.js';
import { validateDaRsDemoConfig, loadDaRsDemoState, isDaRsSelected } from '../../../../blocks/shared/da-rs-bootstrap.js';
import { discoverDaRsCapabilities, getDaRsDemoConfig, invalidateDaRsDiscovery, siteItemCapabilities } from '../../../../blocks/shared/da-rs-provider.js';
import { listDaRsCatalog } from '../../../../blocks/shared/da-rs-api.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const IMPORTED = {
  apiVersion: 1, transport: 'helix6', contentProfile: 'aem-import', readOnly: true, openKinds: ['image', 'sheet'], collaboration: false, branching: false, generation: 'g-test',
};
const NATIVE = {
  apiVersion: 1, transport: 'helix6', contentProfile: 'native-da', readOnly: false, openKinds: ['page', 'sheet', 'image', 'asset'], collaboration: true, branching: true, generation: null,
};
const DEMO = { apiVersion: 1, provider: 'da-rs', org: 'demo', adminEnv: 'local', collabEnv: 'local' };

describe('da-rs demo bootstrap', () => {
  const at = { protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:3000' };
  const loader = (response) => loadDaRsDemoState(at, async () => response());

  it('accepts only the allowed keys and environments', () => {
    expect(validateDaRsDemoConfig(DEMO)).to.deep.equal(DEMO);
    [
      { ...DEMO, token: 'secret' },
      { ...DEMO, adminEnv: 'https://evil.example' },
      { ...DEMO, provider: 'hosted' },
      { ...DEMO, org: 'Demo/../x' },
      { ...DEMO, apiVersion: 2 },
      null,
      [],
    ].forEach((bad) => expect(() => validateDaRsDemoConfig(bad)).to.throw());
  });

  it('keeps native behavior on local 404 and fails closed on a bad local config', async () => {
    expect((await loader(() => new Response('', { status: 404 }))).status).to.equal('absent');
    const ready = await loader(() => new Response(JSON.stringify(DEMO)));
    expect(ready.status).to.equal('ready');
    expect(ready.config.org).to.equal('demo');
    expect((await loader(() => new Response('', { status: 503 }))).status).to.equal('failed');
    expect((await loader(() => new Response('{not json'))).status).to.equal('failed');
    expect((await loader(() => { throw new Error('offline'); })).status).to.equal('failed');
    expect((await loadDaRsDemoState({ protocol: 'file:', origin: 'null' })).status).to.equal('absent');
  });

  it('lets an explicit da-source override the default', () => {
    expect(isDaRsSelected('https://da.example/?da-source=da-rs')).to.equal(true);
    expect(isDaRsSelected('https://da.example/?da-source=hosted')).to.equal(false);
  });

  it('returns no demo config when none is deployed', async () => {
    expect(await getDaRsDemoConfig()).to.equal(null);
  });
});

describe('siteItemCapabilities', () => {
  const imported = Object.freeze(IMPORTED);
  const READ_ONLY = { canWrite: false, collaboration: false, branching: false, readOnly: true };

  it('opens imported folders, images and sheets read-only, and nothing else', () => {
    expect(siteItemCapabilities(imported, 'folder', ['read', 'write'])).to.deep.equal({ ...READ_ONLY, canOpen: true, view: 'browse' });
    expect(siteItemCapabilities(imported, 'image', ['read', 'write'])).to.deep.equal({ ...READ_ONLY, canOpen: true, view: 'media' });
    expect(siteItemCapabilities(imported, 'sheet', ['write'])).to.deep.equal({ ...READ_ONLY, canOpen: true, view: 'sheet-readonly' });
    ['page', 'asset', 'bogus'].forEach((kind) => {
      expect(siteItemCapabilities(imported, kind, ['write'])).to.deep.equal({ ...READ_ONLY, canOpen: false, view: 'none' });
    });
    expect(siteItemCapabilities({ ...imported, openKinds: [] }, 'image', [])).to.include({ view: 'none' });
  });

  it('keeps native sites writable only with permission', () => {
    expect(siteItemCapabilities(NATIVE, 'page', ['read', 'write'])).to.include({ canOpen: true, canWrite: true, collaboration: true, branching: true, readOnly: false });
    expect(siteItemCapabilities(NATIVE, 'page', ['read'])).to.include({ canWrite: false, readOnly: true });
    expect(siteItemCapabilities(NATIVE, 'folder', ['read'])).to.include({ view: 'browse', collaboration: false });
  });

  it('treats unbound as unchanged native routing, not a grant', () => {
    expect(siteItemCapabilities(null, 'page', ['read'])).to.include({ canOpen: true, canWrite: false, readOnly: true });
    expect(siteItemCapabilities(null, 'page', ['read', 'write'])).to.include({ canWrite: true });
    expect(siteItemCapabilities(null, 'folder', undefined)).to.include({ view: 'browse', canWrite: false });
  });
});

describe('da-rs capability discovery and catalog', () => {
  let url;
  let savedFetch;
  let calls;
  let capabilities;
  beforeEach(() => {
    url = window.location.href;
    savedFetch = window.fetch;
    calls = [];
    capabilities = () => new Response(JSON.stringify(IMPORTED));
    const selected = new URL(url);
    selected.searchParams.set('da-source', 'da-rs');
    selected.hash = '#/demo/wknd';
    window.history.replaceState(null, '', selected);
    invalidateDaRsDiscovery();
    window.fetch = async (target, options = {}) => {
      calls.push({ target, options });
      if (target.includes('/ping/')) return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      if (target.endsWith('/source-capabilities')) return capabilities();
      if (target.includes('view=source-catalog')) {
        return new Response('[]');
      }
      return new Response(JSON.stringify([
        { name: 'articles/', 'content-type': 'application/folder', 'x-da-display-name': 'Articles', 'x-da-kind': 'folder' },
        { name: 'machine _96017153.v2.jpeg', 'content-type': 'image/jpeg', size: 512, 'x-da-display-name': 'Machine _96017153.v2.jpeg', 'x-da-kind': 'image' },
        { name: 'offers.json', 'content-type': 'application/json', 'x-da-display-name': 'Offers', 'x-da-kind': 'sheet' },
        { name: 'brochure.pdf', 'content-type': 'application/pdf', 'x-da-kind': 'asset' },
      ]));
    };
  });
  afterEach(() => {
    window.fetch = savedFetch;
    window.history.replaceState(null, '', url);
    invalidateDaRsDiscovery();
  });

  it('discovers and caches imported capabilities for the same context', async () => {
    const [one, two] = await Promise.all([
      discoverDaRsCapabilities('demo', 'wknd'),
      discoverDaRsCapabilities('demo', 'wknd'),
    ]);
    expect(one).to.equal(two);
    expect(one).to.include({ contentProfile: 'aem-import', readOnly: true, generation: 'g-test' });
    expect(calls.map(({ target }) => target)).to.deep.equal([
      `${DA_ORIGIN}/ping/demo/wknd`,
      `${DA_ORIGIN}/demo/sites/wknd/source-capabilities`,
    ]);
    expect(calls[1].options.redirect).to.equal('error');
    invalidateDaRsDiscovery();
    await discoverDaRsCapabilities('demo', 'wknd');
    expect(calls).to.have.length(4);
  });

  it('fails closed on errors and incoherent responses, without caching them', async () => {
    capabilities = () => new Response('', { status: 503 });
    let failed = 0;
    try {
      await discoverDaRsCapabilities('demo', 'wknd');
    } catch {
      failed += 1;
    }
    capabilities = () => new Response(JSON.stringify({ ...IMPORTED, readOnly: false }));
    try {
      await discoverDaRsCapabilities('demo', 'wknd');
    } catch {
      failed += 1;
    }
    capabilities = () => new Response(JSON.stringify({ ...IMPORTED, openKinds: ['video'] }));
    try {
      await discoverDaRsCapabilities('demo', 'wknd');
    } catch {
      failed += 1;
    }
    expect(failed).to.equal(3);
    capabilities = () => new Response(JSON.stringify(NATIVE));
    expect((await discoverDaRsCapabilities('demo', 'wknd')).contentProfile).to.equal('native-da');
  });

  it('fails closed when a confirmed H6 site has no capabilities endpoint, even with an explicit URL', async () => {
    capabilities = () => new Response('', { status: 404 });
    let failed = false;
    try {
      await discoverDaRsCapabilities('demo', 'wknd');
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
  });

  it('still returns null for a genuinely legacy site outside a configured demo', async () => {
    window.fetch = async (target, options = {}) => {
      calls.push({ target, options });
      return new Response('');
    };
    expect(await discoverDaRsCapabilities('demo', 'wknd')).to.equal(null);
    expect(calls).to.have.length(1);
  });

  it('returns null when no provider is selected', async () => {
    window.history.replaceState(null, '', url.split('?')[0]);
    invalidateDaRsDiscovery();
    expect(await discoverDaRsCapabilities('demo', 'wknd')).to.equal(null);
    expect(calls).to.have.length(0);
  });

  it('drops a response that arrives after the context changed', async () => {
    let release;
    capabilities = () => new Promise((resolve) => {
      release = () => resolve(new Response(JSON.stringify(IMPORTED)));
    });
    const pending = discoverDaRsCapabilities('demo', 'wknd');
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    window.history.replaceState(null, '', `${window.location.pathname}?da-source=da-rs&da-admin=stage#/demo/wknd`);
    release();
    let failed = false;
    try {
      await pending;
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
  });

  it('normalizes imported listings, keeping display names, kinds and last-dot basenames', async () => {
    const { source } = await getNx2Api();
    const { items } = await source.list('/demo/wknd');
    const byPath = Object.fromEntries(items.map((item) => [item.path, item]));
    const image = byPath['/demo/wknd/machine _96017153.v2.jpeg'];
    expect(image).to.include({
      name: 'machine _96017153.v2', ext: 'jpeg', kind: 'image', size: 512, displayName: 'Machine _96017153.v2.jpeg', contentType: 'image/jpeg',
    });
    expect(image.capabilities).to.include({ view: 'media', canWrite: false, readOnly: true });
    expect(byPath['/demo/wknd/articles']).to.include({ kind: 'folder', name: 'articles', displayName: 'Articles', contentProfile: 'aem-import' });
    expect(byPath['/demo/wknd/offers.json'].capabilities.view).to.equal('sheet-readonly');
    expect(byPath['/demo/wknd/brochure.pdf'].capabilities.view).to.equal('none');
  });

  it('encodes Source URLs, but not normalized listing paths, for a decoded alias directory', async () => {
    const { source } = await getNx2Api();
    const { items } = await source.list('/demo/wknd/café_offers.v2/Package MyBarista');
    const expected = `${DA_ORIGIN}/demo/sites/wknd/source/caf%C3%A9_offers.v2/Package%20MyBarista/`;
    expect(calls.some(({ target }) => target === expected)).to.equal(true);
    const alias = '/demo/wknd/café_offers.v2/Package MyBarista/machine _96017153.v2.jpeg';
    expect(items.some(({ path }) => path === alias)).to.equal(true);
    await source.get(alias);
    expect(calls.at(-1).target).to.equal(`${expected}machine%20_96017153.v2.jpeg`);
  });

  it('does not reinterpret URL-encoded aliases passed to the decoded Source API', async () => {
    const { source } = await getNx2Api();
    const badPaths = ['machine%20_96017153.jpeg', 'file%252F.png', 'a//file.png', 'a/../file.png', 'file\n.png'];
    const outcomes = await Promise.allSettled(badPaths.map((alias) => source.get(`/demo/wknd/${alias}`)));
    expect(outcomes.map(({ status }) => status)).to.deep.equal(badPaths.map(() => 'rejected'));
    expect(calls).to.deep.equal([]);
  });

  it('lists the catalog with continuation, sorted, and fails closed on bad records', async () => {
    const pages = [
      { body: [{ name: 'wknd', title: 'wknd', transport: 'helix6', contentProfile: 'aem-import' }, { name: 'harbor', title: 'Harbor Night Market', transport: 'helix6', contentProfile: 'native-da' }], token: 'next' },
      { body: [{ name: 'dam', title: 'dam', transport: 'helix6', contentProfile: 'aem-import' }] },
    ];
    window.fetch = async (target, options = {}) => {
      calls.push({ target, options });
      const page = pages[calls.length - 1];
      return new Response(JSON.stringify(page.body), { headers: page.token ? { 'da-continuation-token': page.token } : {} });
    };
    const catalog = await listDaRsCatalog('demo');
    expect(catalog.map(({ name }) => name)).to.deep.equal(['dam', 'harbor', 'wknd']);
    expect(catalog[1]).to.deep.equal({ name: 'harbor', title: 'Harbor Night Market', transport: 'helix6', contentProfile: 'native-da' });
    expect(calls[0].target).to.equal(`${DA_ORIGIN}/list/demo?view=source-catalog`);
    expect(calls[1].options.headers['da-continuation-token']).to.equal('next');

    window.fetch = async () => new Response(JSON.stringify([{ name: 'x', title: 't', transport: 'ftp', contentProfile: 'aem-import' }]));
    let failed = false;
    try {
      await listDaRsCatalog('demo');
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
    window.fetch = async () => new Response('', { status: 403 });
    failed = false;
    try {
      await listDaRsCatalog('demo');
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
  });
});
