import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { loadOrgConfig, mutatePermissions, listSites, listFolders } = await import('../../../../blocks/permissions/api.js');

const CONFIG_BODY = {
  ':names': ['data', 'permissions'],
  ':version': 3,
  data: { total: 1, limit: 1, data: [{ key: 'foo', value: 'bar' }] },
  permissions: {
    total: 1,
    limit: 1,
    data: [{ path: 'CONFIG', groups: 'admins@example.com', actions: 'write' }],
  },
};

const NO_SHEET_BODY = {
  ':names': ['data'],
  data: { total: 1, limit: 1, data: [{ key: 'foo', value: 'bar' }] },
};

describe('permissions/api loadOrgConfig', () => {
  let savedFetch;

  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  it('403 -> status no-access', async () => {
    window.fetch = async () => new Response('', { status: 403 });
    const result = await loadOrgConfig('myorg');
    expect(result.status).to.equal('no-access');
    expect(result.config).to.equal(null);
    expect(result.rules).to.deep.equal([]);
  });

  it('404 -> status no-access', async () => {
    window.fetch = async () => new Response('', { status: 404 });
    const result = await loadOrgConfig('myorg');
    expect(result.status).to.equal('no-access');
  });

  it('500 -> status error', async () => {
    window.fetch = async () => new Response('', { status: 500 });
    const result = await loadOrgConfig('myorg');
    expect(result.status).to.equal('error');
  });

  it('200 without a permissions sheet -> status no-sheet', async () => {
    window.fetch = async () => new Response(JSON.stringify(NO_SHEET_BODY), { status: 200 });
    const result = await loadOrgConfig('myorg');
    expect(result.status).to.equal('no-sheet');
    expect(result.rules).to.deep.equal([]);
  });

  it('200 with a permissions sheet -> status ok, rules equal permissions.data', async () => {
    window.fetch = async () => new Response(JSON.stringify(CONFIG_BODY), { status: 200 });
    const result = await loadOrgConfig('myorg');
    expect(result.status).to.equal('ok');
    expect(result.rules).to.deep.equal(CONFIG_BODY.permissions.data);
  });

  it('200 with an unparsable body -> status error', async () => {
    window.fetch = async () => new Response('not json', { status: 200 });
    const result = await loadOrgConfig('myorg');
    expect(result.status).to.equal('error');
  });
});

describe('permissions/api mutatePermissions', () => {
  let savedFetch;
  let getCalls;
  let putCalls;

  beforeEach(() => {
    savedFetch = window.fetch;
    getCalls = [];
    putCalls = [];
  });
  afterEach(() => { window.fetch = savedFetch; });

  function stubFetch(getBody, putStatus = 200) {
    window.fetch = async (url, opts = {}) => {
      if (opts.method === 'PUT') {
        putCalls.push({ url: String(url), opts });
        return new Response('', { status: putStatus });
      }
      getCalls.push(String(url));
      return new Response(JSON.stringify(getBody), { status: 200 });
    };
  }

  it('sends exactly one GET then one PUT to /config/myorg/ (not /myorg/site)', async () => {
    stubFetch(CONFIG_BODY);
    const mutate = (config) => {
      const next = structuredClone(config);
      next.permissions.data.push({ path: '/ + **', groups: 'readers@example.com', actions: 'read' });
      return { config: next, changed: true };
    };
    const result = await mutatePermissions('myorg', mutate);

    expect(getCalls.length).to.equal(1);
    expect(putCalls.length).to.equal(1);
    expect(putCalls[0].url).to.contain('/config/myorg/');
    expect(putCalls[0].url).to.not.contain('/myorg/site');
    expect(result.ok).to.equal(true);

    const config = putCalls[0].opts.body.get('config');
    const parsed = JSON.parse(config);
    expect(parsed.permissions.data).to.have.length(2);
  });

  it('preserves other sheets: PUT body data/:names deep-equal the GET response', async () => {
    stubFetch(CONFIG_BODY);
    const mutate = (config) => {
      const next = structuredClone(config);
      next.permissions.data.push({ path: '/ + **', groups: 'readers@example.com', actions: 'read' });
      return { config: next, changed: true };
    };
    await mutatePermissions('myorg', mutate);

    const saved = JSON.parse(putCalls[0].opts.body.get('config'));
    expect(saved.data).to.deep.equal(CONFIG_BODY.data);
    expect(saved[':names']).to.deep.equal(CONFIG_BODY[':names']);
  });

  it('changed: false makes no PUT', async () => {
    stubFetch(CONFIG_BODY);
    const mutate = (config) => ({ config, changed: false });
    const result = await mutatePermissions('myorg', mutate);

    expect(getCalls.length).to.equal(1);
    expect(putCalls.length).to.equal(0);
    expect(result).to.deep.equal({ ok: true, status: 200, rules: CONFIG_BODY.permissions.data });
  });

  it('GET 403 -> { ok: false, status: 403 }, no PUT', async () => {
    window.fetch = async (url, opts = {}) => {
      if (opts.method === 'PUT') {
        putCalls.push({ url, opts });
        return new Response('', { status: 200 });
      }
      return new Response('', { status: 403 });
    };
    const mutate = (config) => ({ config, changed: true });
    const result = await mutatePermissions('myorg', mutate);
    expect(result).to.deep.equal({ ok: false, status: 403 });
    expect(putCalls.length).to.equal(0);
  });

  it('GET 200 without a permissions sheet -> { ok: false, status: 409, error: no-sheet }', async () => {
    stubFetch(NO_SHEET_BODY);
    const mutate = (config) => ({ config, changed: true });
    const result = await mutatePermissions('myorg', mutate);
    expect(result).to.deep.equal({ ok: false, status: 409, error: 'no-sheet' });
  });

  it('PUT 403 -> { ok: false, status: 403 }', async () => {
    stubFetch(CONFIG_BODY, 403);
    const mutate = (config) => {
      const next = structuredClone(config);
      next.permissions.data.push({ path: '/ + **', groups: 'readers@example.com', actions: 'read' });
      return { config: next, changed: true };
    };
    const result = await mutatePermissions('myorg', mutate);
    expect(result).to.deep.equal({ ok: false, status: 403 });
  });
});

describe('permissions/api listSites', () => {
  let savedFetch;

  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  it('returns folder names only', async () => {
    const items = [
      { name: 'site-a' },
      { name: 'site-b' },
      { name: 'notes.json', ext: 'json' },
    ];
    window.fetch = async () => new Response(JSON.stringify(items), { status: 200 });
    const sites = await listSites('myorg');
    expect(sites).to.deep.equal(['site-a', 'site-b']);
  });

  it('returns [] on failure', async () => {
    window.fetch = async () => new Response('', { status: 500 });
    const sites = await listSites('myorg');
    expect(sites).to.deep.equal([]);
  });
});

describe('permissions/api listFolders', () => {
  let savedFetch;

  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  it('returns folders only, as { name, path }', async () => {
    window.fetch = async (url) => {
      const href = String(url);
      if (href.includes('/ping/')) return new Response('', { status: 200 });
      const items = [
        { name: 'assets', path: '/myorg/mysite/docs/assets' },
        { name: 'page.html', path: '/myorg/mysite/docs/page.html', ext: 'html' },
      ];
      return new Response(JSON.stringify(items), { status: 200 });
    };
    const folders = await listFolders('myorg', 'mysite', '/docs');
    expect(folders).to.deep.equal([{ name: 'assets', path: '/myorg/mysite/docs/assets' }]);
  });

  it('returns [] on failure', async () => {
    window.fetch = async (url) => {
      const href = String(url);
      if (href.includes('/ping/')) return new Response('', { status: 200 });
      return new Response('', { status: 500 });
    };
    const folders = await listFolders('myorg', 'mysite');
    expect(folders).to.deep.equal([]);
  });
});
