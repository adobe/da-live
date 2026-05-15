import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';
import {
  daFetch,
  etcFetch,
  aemAdmin,
  saveToDa,
  getSheetByIndex,
  getSheetByName,
  getFirstSheet,
  delay,
  getSidekickConfig,
  sanitizeName,
  fetchDaConfigs,
  getAuthToken,
} from '../../../../blocks/shared/utils.js';

// daFetch's 401-no-token path lazy-loads the banner module, which resolves
// `${getNx()}/utils/utils.js`. Configure nx for the test environment so that
// import works.
setNx('/test/fixtures/nx', { hostname: 'example.com' });

describe('getSheetByIndex', () => {
  it('Returns data directly for non-multi-sheet', () => {
    const json = { ':type': 'sheet', data: [{ a: 1 }] };
    expect(getSheetByIndex(json)).to.deep.equal([{ a: 1 }]);
  });

  it('Returns first sheet data for multi-sheet at index 1', () => {
    // index 0 is the ':type' key, so the first sheet is at index 1
    const json = { ':type': 'multi-sheet', sheet1: { data: [{ a: 1 }] }, sheet2: { data: [{ b: 2 }] } };
    expect(getSheetByIndex(json, 1)).to.deep.equal([{ a: 1 }]);
  });

  it('Returns second sheet data for multi-sheet at index 2', () => {
    const json = { ':type': 'multi-sheet', sheet1: { data: [{ a: 1 }] }, sheet2: { data: [{ b: 2 }] } };
    expect(getSheetByIndex(json, 2)).to.deep.equal([{ b: 2 }]);
  });

  it('Returns undefined for out-of-bounds index', () => {
    const json = { ':type': 'multi-sheet', sheet1: { data: [{ a: 1 }] } };
    expect(getSheetByIndex(json, 5)).to.equal(undefined);
  });

  it('Defaults to index 0 which is the type key', () => {
    // index 0 is ':type' which has no .data, so returns undefined
    const json = { ':type': 'multi-sheet', sheet1: { data: [{ x: 99 }] } };
    expect(getSheetByIndex(json)).to.equal(undefined);
  });
});

describe('getSheetByName', () => {
  it('Returns data for the named sheet in a multi-sheet config', () => {
    const json = { ':type': 'multi-sheet', library: { data: [{ title: 'Blocks', path: '/blocks' }] }, settings: { data: [{ key: 'x' }] } };
    expect(getSheetByName(json, 'library')).to.deep.equal([{ title: 'Blocks', path: '/blocks' }]);
  });

  it('Returns undefined when the named sheet does not exist in a multi-sheet config', () => {
    const json = { ':type': 'multi-sheet', settings: { data: [{ key: 'x' }] } };
    expect(getSheetByName(json, 'library')).to.equal(undefined);
  });

  it('Returns data for a single-sheet config when :sheetname matches', () => {
    const json = { ':type': 'sheet', ':sheetname': 'library', data: [{ title: 'Blocks', path: '/blocks' }] };
    expect(getSheetByName(json, 'library')).to.deep.equal([{ title: 'Blocks', path: '/blocks' }]);
  });

  it('Returns undefined for a single-sheet config when :sheetname does not match', () => {
    const json = { ':type': 'sheet', ':sheetname': 'settings', data: [{ title: 'Blocks', path: '/blocks' }] };
    expect(getSheetByName(json, 'library')).to.equal(undefined);
  });

  it('Returns undefined for a single-sheet config with no :sheetname', () => {
    const json = { ':type': 'sheet', data: [{ title: 'Blocks', path: '/blocks' }] };
    expect(getSheetByName(json, 'library')).to.equal(undefined);
  });

  it('Returns undefined for a single-sheet config with matching :sheetname but no data', () => {
    const json = { ':type': 'sheet', ':sheetname': 'library' };
    expect(getSheetByName(json, 'library')).to.equal(undefined);
  });
});

describe('getFirstSheet', () => {
  it('Returns undefined for multi-sheet (index 0 is the type key)', () => {
    // getFirstSheet calls getSheetByIndex with index 0, which is ':type'
    const json = { ':type': 'multi-sheet', sheet1: { data: [{ a: 1 }] }, sheet2: { data: [{ b: 2 }] } };
    expect(getFirstSheet(json)).to.equal(undefined);
  });

  it('Returns data directly for non-multi-sheet', () => {
    const json = { ':type': 'sheet', data: [{ c: 3 }] };
    expect(getFirstSheet(json)).to.deep.equal([{ c: 3 }]);
  });
});

describe('delay', () => {
  it('Returns a promise that resolves', async () => {
    const result = delay(0);
    expect(result).to.be.instanceOf(Promise);
    await result;
  });
});

describe('sanitizeName', () => {
  it('Lowercases alphanumeric input unchanged', () => {
    expect(sanitizeName('AbC123')).to.equal('abc123');
  });

  it('Replaces a single invalid character with a hyphen', () => {
    expect(sanitizeName('foo bar')).to.equal('foo-bar');
  });

  it('Collapses consecutive invalid characters into a single hyphen', () => {
    expect(sanitizeName('foo!!bar')).to.equal('foo-bar');
    expect(sanitizeName('foo   bar')).to.equal('foo-bar');
    expect(sanitizeName('a!@#$%b')).to.equal('a-b');
  });

  it('Preserves an existing single hyphen between alphanumeric chars', () => {
    expect(sanitizeName('foo-bar')).to.equal('foo-bar');
  });

  it('Collapses hyphens adjacent to hyphens produced by substitution', () => {
    // Simulates: user already has "foo-" and then types an invalid char.
    expect(sanitizeName('foo-!')).to.equal('foo-');
    expect(sanitizeName('foo-!bar')).to.equal('foo-bar');
  });

  it('Preserves a single trailing hyphen by default (typing-time behavior)', () => {
    expect(sanitizeName('foo!')).to.equal('foo-');
    expect(sanitizeName('foo-')).to.equal('foo-');
  });

  it('Removes dots by default', () => {
    expect(sanitizeName('foo.bar')).to.equal('foo-bar');
  });

  it('Preserves dots when allowDot is true', () => {
    expect(sanitizeName('foo.bar', { allowDot: true })).to.equal('foo.bar');
    expect(sanitizeName('my.file.name', { allowDot: true })).to.equal('my.file.name');
  });

  it('Does not collapse dots into hyphens in allowDot mode', () => {
    expect(sanitizeName('foo..bar', { allowDot: true })).to.equal('foo..bar');
  });

  it('Still collapses invalid chars around dots in allowDot mode', () => {
    expect(sanitizeName('foo!.bar', { allowDot: true })).to.equal('foo-.bar');
    expect(sanitizeName('foo.!bar', { allowDot: true })).to.equal('foo.-bar');
  });

  it('Trims a trailing hyphen when trimTrailing is true', () => {
    expect(sanitizeName('foo!', { trimTrailing: true })).to.equal('foo');
    expect(sanitizeName('foo-', { trimTrailing: true })).to.equal('foo');
  });

  it('Trims multiple trailing non-alphanumeric chars when trimTrailing is true', () => {
    expect(sanitizeName('foo!!!', { trimTrailing: true })).to.equal('foo');
  });

  it('Trims trailing hyphens and dots in allowDot + trimTrailing mode', () => {
    expect(sanitizeName('foo.', { allowDot: true, trimTrailing: true })).to.equal('foo');
    expect(sanitizeName('foo-', { allowDot: true, trimTrailing: true })).to.equal('foo');
    expect(sanitizeName('foo.-', { allowDot: true, trimTrailing: true })).to.equal('foo');
  });

  it('Returns empty string when input is only invalid chars and trimTrailing is true', () => {
    expect(sanitizeName('!!!', { trimTrailing: true })).to.equal('');
    expect(sanitizeName('---', { trimTrailing: true })).to.equal('');
  });

  it('Returns empty string for empty input', () => {
    expect(sanitizeName('')).to.equal('');
    expect(sanitizeName('', { trimTrailing: true })).to.equal('');
  });

  it('Does not trim leading hyphens (only trailing)', () => {
    expect(sanitizeName('!foo', { trimTrailing: true })).to.equal('-foo');
  });

  it('Does not affect internal hyphens when trimming trailing', () => {
    expect(sanitizeName('foo-bar-', { trimTrailing: true })).to.equal('foo-bar');
    expect(sanitizeName('foo-bar-baz', { trimTrailing: true })).to.equal('foo-bar-baz');
  });
});

describe('getAuthToken', () => {
  let savedAdobeIMS;

  beforeEach(() => {
    savedAdobeIMS = window.adobeIMS;
    window.localStorage.removeItem('nx-ims');
  });

  afterEach(() => {
    // Always remove rather than restoring — preserving a leaked value would
    // propagate it to later tests/files whose getAuthToken can't survive it.
    window.localStorage.removeItem('nx-ims');
    if (savedAdobeIMS === undefined) {
      delete window.adobeIMS;
    } else {
      window.adobeIMS = savedAdobeIMS;
    }
  });

  it('Returns null when nx-ims is not set', async () => {
    window.localStorage.removeItem('nx-ims');
    window.adobeIMS = { getAccessToken: () => ({ token: 'should-not-see' }) };
    expect(await getAuthToken()).to.be.null;
  });

  it('Reads the live token from window.adobeIMS.getAccessToken when present', async () => {
    window.localStorage.setItem('nx-ims', 'true');
    let calls = 0;
    const tokens = ['T1', 'T2'];
    window.adobeIMS = {
      getAccessToken: () => {
        const t = tokens[calls];
        calls += 1;
        return { token: t };
      },
    };

    expect(await getAuthToken()).to.equal('T1');
    expect(await getAuthToken()).to.equal('T2');
  });

  it('Returns null when getAccessToken returns null (signed out)', async () => {
    window.localStorage.setItem('nx-ims', 'true');
    window.adobeIMS = { getAccessToken: () => null };
    expect(await getAuthToken()).to.be.null;
  });
});

describe('daFetch', () => {
  let savedFetch;

  beforeEach(() => {
    savedFetch = window.fetch;
    window.localStorage.removeItem('nx-ims');
  });

  afterEach(() => {
    window.fetch = savedFetch;
    window.localStorage.removeItem('nx-ims');
  });

  it('Defaults headers when none are provided', async () => {
    window.localStorage.removeItem('nx-ims');
    let capturedOpts;
    window.fetch = (url, opts) => {
      capturedOpts = opts;
      return Promise.resolve(new Response('ok', { status: 200 }));
    };

    await daFetch('https://example.com/test');
    expect(capturedOpts.headers).to.deep.equal({});
  });

  it('Fetches without auth when nx-ims is not set', async () => {
    window.localStorage.removeItem('nx-ims');
    let capturedOpts;
    window.fetch = (url, opts) => {
      capturedOpts = opts;
      return Promise.resolve(new Response('ok', { status: 200 }));
    };

    const resp = await daFetch('https://example.com/test');
    expect(resp.ok).to.be.true;
    expect(capturedOpts.headers.Authorization).to.be.undefined;
  });

  it('Sets x-da-child-actions as permissions when header present', async () => {
    window.localStorage.removeItem('nx-ims');
    window.fetch = () => Promise.resolve(new Response('ok', {
      status: 200,
      headers: { 'x-da-child-actions': 'actions=read,write,delete' },
    }));

    const resp = await daFetch('https://example.com/test');
    expect(resp.permissions).to.deep.equal(['read', 'write', 'delete']);
  });

  it('Falls back to x-da-actions when x-da-child-actions is not present', async () => {
    window.localStorage.removeItem('nx-ims');
    window.fetch = () => Promise.resolve(new Response('ok', {
      status: 200,
      headers: { 'x-da-actions': 'actions=read' },
    }));

    const resp = await daFetch('https://example.com/test');
    expect(resp.permissions).to.deep.equal(['read']);
  });

  it('Defaults permissions to read,write when no action headers', async () => {
    window.localStorage.removeItem('nx-ims');
    window.fetch = () => Promise.resolve(new Response('ok', { status: 200 }));

    const resp = await daFetch('https://example.com/test');
    expect(resp.permissions).to.deep.equal(['read', 'write']);
  });

  it('On 401 with no token, dispatches banner instead of redirecting to IMS', async () => {
    window.localStorage.removeItem('nx-ims');
    const savedIMS = window.adobeIMS;
    delete window.adobeIMS;

    window.fetch = () => Promise.resolve(new Response('nope', { status: 401 }));

    try {
      // DA_ORIGINS in utils.js includes http://localhost:8787 — use that so the
      // 401 path triggers without us needing to monkey-patch the origin list.
      const resp = await daFetch('http://localhost:8787/source/o/r/p.html');
      // Wait for the dynamic banner import to settle.
      await new Promise((r) => { setTimeout(r, 80); });

      expect(resp.ok).to.equal(false);
      expect(document.querySelector('da-dialog.da-auth-banner')).to.exist;
    } finally {
      document.querySelector('da-dialog.da-auth-banner')?.remove();
      if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
    }
  });

  it('On 401 with a token, refreshToken-and-retry recovers without redirect', async () => {
    window.localStorage.setItem('nx-ims', 'true');
    const savedIMS = window.adobeIMS;
    let getCalls = 0;
    const tokens = ['stale', 'fresh'];
    window.adobeIMS = {
      getAccessToken: () => {
        const t = tokens[Math.min(getCalls, tokens.length - 1)];
        getCalls += 1;
        return { token: t };
      },
      refreshToken: async () => {},
    };

    let fetchCalls = 0;
    const capturedAuth = [];
    window.fetch = (url, opts) => {
      fetchCalls += 1;
      capturedAuth.push(opts?.headers?.Authorization);
      // First call returns 401; second returns 200.
      return Promise.resolve(new Response('ok', { status: fetchCalls === 1 ? 401 : 200 }));
    };

    try {
      const resp = await daFetch('http://localhost:8787/source/o/r/p.html');
      expect(resp.ok).to.equal(true);
      expect(fetchCalls).to.equal(2);
      expect(capturedAuth).to.deep.equal(['Bearer stale', 'Bearer fresh']);
    } finally {
      if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
    }
  });

  it('Returns 403 response directly', async () => {
    window.localStorage.removeItem('nx-ims');
    window.fetch = () => Promise.resolve(new Response('forbidden', { status: 403 }));

    const resp = await daFetch('https://example.com/test');
    expect(resp.status).to.equal(403);
  });
});

describe('etcFetch', () => {
  it('Constructs URL with encoded href and calls fetch', async () => {
    const savedFetch = window.fetch;
    let capturedUrl;
    window.fetch = (url) => {
      capturedUrl = url;
      return Promise.resolve(new Response('ok', { status: 200 }));
    };

    try {
      await etcFetch('https://example.com/path?q=1', 'snapshot');
      expect(capturedUrl).to.include('/snapshot?url=');
      expect(capturedUrl).to.include(encodeURIComponent('https://example.com/path?q=1'));
    } finally {
      window.fetch = savedFetch;
    }
  });

  it('Passes options through to fetch', async () => {
    const savedFetch = window.fetch;
    let capturedOpts;
    window.fetch = (url, opts) => {
      capturedOpts = opts;
      return Promise.resolve(new Response('ok', { status: 200 }));
    };

    try {
      await etcFetch('https://example.com', 'api', { method: 'POST' });
      expect(capturedOpts.method).to.equal('POST');
    } finally {
      window.fetch = savedFetch;
    }
  });
});

describe('aemAdmin', () => {
  let savedFetch;
  let savedLocalStorage;

  beforeEach(() => {
    savedFetch = window.fetch;
    savedLocalStorage = window.localStorage.getItem('nx-ims');
    window.localStorage.removeItem('nx-ims');
  });

  afterEach(() => {
    window.fetch = savedFetch;
    if (savedLocalStorage) {
      window.localStorage.setItem('nx-ims', savedLocalStorage);
    } else {
      window.localStorage.removeItem('nx-ims');
    }
  });

  it('Constructs correct AEM admin URL from path', async () => {
    let capturedUrl;
    window.fetch = (url) => {
      capturedUrl = url;
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    };

    await aemAdmin('/owner/repo/folder/page.html', 'preview');
    expect(capturedUrl).to.equal('https://admin.hlx.page/preview/owner/repo/main/folder/page');
  });

  it('Strips .html extension from name', async () => {
    let capturedUrl;
    window.fetch = (url) => {
      capturedUrl = url;
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    };

    await aemAdmin('/owner/repo/test.html', 'preview');
    expect(capturedUrl).to.include('/test');
    expect(capturedUrl).not.to.include('.html');
  });

  it('Returns empty object for DELETE with 204', async () => {
    window.fetch = () => Promise.resolve(new Response(null, { status: 204 }));

    const result = await aemAdmin('/owner/repo/page', 'preview', 'DELETE');
    expect(result).to.deep.equal({});
  });

  it('Returns undefined when response is not ok', async () => {
    window.fetch = () => Promise.resolve(new Response('error', { status: 500 }));

    const result = await aemAdmin('/owner/repo/page', 'preview');
    expect(result).to.equal(undefined);
  });
});

describe('saveToDa', () => {
  let savedFetch;
  let savedLocalStorage;

  beforeEach(() => {
    savedFetch = window.fetch;
    savedLocalStorage = window.localStorage.getItem('nx-ims');
    window.localStorage.removeItem('nx-ims');
  });

  afterEach(() => {
    window.fetch = savedFetch;
    if (savedLocalStorage) {
      window.localStorage.setItem('nx-ims', savedLocalStorage);
    } else {
      window.localStorage.removeItem('nx-ims');
    }
  });

  it('Returns undefined when DA response is not ok', async () => {
    window.fetch = () => Promise.resolve(new Response('error', { status: 500 }));

    const result = await saveToDa({ path: '/org/repo/page' });
    expect(result).to.equal(undefined);
  });

  it('Returns undefined when preview is false (default)', async () => {
    window.fetch = () => Promise.resolve(new Response('ok', { status: 200 }));

    const result = await saveToDa({ path: '/org/repo/page' });
    expect(result).to.equal(undefined);
  });

  it('Uses PUT method', async () => {
    let capturedOpts;
    window.fetch = (url, opts) => {
      capturedOpts = opts;
      return Promise.resolve(new Response('ok', { status: 200 }));
    };

    await saveToDa({ path: '/org/repo/page' });
    expect(capturedOpts.method).to.equal('PUT');
  });

  it('Appends blob and props to form data', async () => {
    let capturedBody;
    window.fetch = (url, opts) => {
      capturedBody = opts?.body;
      return Promise.resolve(new Response('ok', { status: 200 }));
    };

    const blob = new Blob(['test'], { type: 'text/html' });
    const props = { title: 'Test' };
    await saveToDa({ path: '/org/repo/page', blob, props });
    expect(capturedBody).to.be.instanceOf(FormData);
    expect(capturedBody.get('data')).to.be.instanceOf(Blob);
    expect(capturedBody.get('props')).to.equal(JSON.stringify(props));
  });
});

describe('getSidekickConfig', () => {
  it('Returns preview and prod when both hosts are available', async () => {
    const org = 'org1';
    const site = 'site1';
    const configUrl = `https://admin.hlx.page/sidekick/${org}/${site}/main/config.json`;

    const mockFetch = (url) => {
      if (url === configUrl) {
        return Promise.resolve(new Response(JSON.stringify({
          previewHost: 'preview.example.com',
          host: 'www.example.com',
        }), { status: 200 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    };

    const savedFetch = window.fetch;
    try {
      window.fetch = mockFetch;
      const result = await getSidekickConfig({ org, site });
      expect(result).to.deep.equal({
        previewHost: 'preview.example.com',
        host: 'www.example.com',
      });
    } finally {
      window.fetch = savedFetch;
    }
  });

  it('Returns object when only previewHost is available', async () => {
    const org = 'org2';
    const site = 'site2';
    const configUrl = `https://admin.hlx.page/sidekick/${org}/${site}/main/config.json`;

    const mockFetch = (url) => {
      if (url === configUrl) {
        return Promise.resolve(new Response(JSON.stringify({ previewHost: 'preview.example.com' }), { status: 200 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    };

    const savedFetch = window.fetch;
    try {
      window.fetch = mockFetch;
      const result = await getSidekickConfig({ org, site });
      expect(result).to.deep.equal({ previewHost: 'preview.example.com' });
    } finally {
      window.fetch = savedFetch;
    }
  });

  it('Returns object when only host is available', async () => {
    const org = 'org3';
    const site = 'site3';
    const configUrl = `https://admin.hlx.page/sidekick/${org}/${site}/main/config.json`;

    const mockFetch = (url) => {
      if (url === configUrl) {
        return Promise.resolve(new Response(JSON.stringify({ host: 'www.example.com' }), { status: 200 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    };

    const savedFetch = window.fetch;
    try {
      window.fetch = mockFetch;
      const result = await getSidekickConfig({ org, site });
      expect(result).to.deep.equal({ host: 'www.example.com' });
    } finally {
      window.fetch = savedFetch;
    }
  });

  it('Returns empty object when neither previewHost nor host is available', async () => {
    const org = 'org4';
    const site = 'site4';
    const configUrl = `https://admin.hlx.page/sidekick/${org}/${site}/main/config.json`;

    const mockFetch = (url) => {
      if (url === configUrl) {
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    };

    const savedFetch = window.fetch;
    try {
      window.fetch = mockFetch;
      const result = await getSidekickConfig({ org, site });
      expect(result).to.deep.equal({});
    } finally {
      window.fetch = savedFetch;
    }
  });

  it('Returns undefined when fetch fails', async () => {
    const org = 'org5';
    const site = 'site5';
    const configUrl = `https://admin.hlx.page/sidekick/${org}/${site}/main/config.json`;

    const mockFetch = (url) => {
      if (url === configUrl) {
        return Promise.resolve(new Response('', { status: 404 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    };

    const savedFetch = window.fetch;
    try {
      window.fetch = mockFetch;
      const result = await getSidekickConfig({ org, site });
      expect(result).to.equal(undefined);
    } finally {
      window.fetch = savedFetch;
    }
  });
});

describe('fetchDaConfigs', () => {
  let savedFetch;
  let savedLocalStorage;

  beforeEach(() => {
    savedFetch = window.fetch;
    savedLocalStorage = window.localStorage.getItem('nx-ims');
    window.localStorage.removeItem('nx-ims');
  });

  afterEach(() => {
    window.fetch = savedFetch;
    if (savedLocalStorage) {
      window.localStorage.setItem('nx-ims', savedLocalStorage);
    } else {
      window.localStorage.removeItem('nx-ims');
    }
  });

  it('Returns early without calling fetch when org is empty', async () => {
    let fetchCalled = false;
    window.fetch = () => {
      fetchCalled = true;
      return Promise.resolve(new Response('ok', { status: 200 }));
    };

    const results = fetchDaConfigs({ org: '', site: 'something' });
    expect(results).to.be.an('array').with.lengthOf(1);
    const resolved = await results[0];
    expect(resolved).to.equal(null);
    expect(fetchCalled).to.be.false;
  });

  it('Returns early without calling fetch when org is undefined', async () => {
    let fetchCalled = false;
    window.fetch = () => {
      fetchCalled = true;
      return Promise.resolve(new Response('ok', { status: 200 }));
    };

    const results = fetchDaConfigs({ org: undefined, site: 'something' });
    expect(results).to.be.an('array').with.lengthOf(1);
    const resolved = await results[0];
    expect(resolved).to.equal(null);
    expect(fetchCalled).to.be.false;
  });
});

describe('saveToDa — malformed path guard', () => {
  let savedFetch;
  let savedLocalStorage;

  beforeEach(() => {
    savedFetch = window.fetch;
    savedLocalStorage = window.localStorage.getItem('nx-ims');
    window.localStorage.removeItem('nx-ims');
  });

  afterEach(() => {
    window.fetch = savedFetch;
    if (savedLocalStorage) {
      window.localStorage.setItem('nx-ims', savedLocalStorage);
    } else {
      window.localStorage.removeItem('nx-ims');
    }
  });

  it('Returns undefined without calling fetch when path is a full URL', async () => {
    let fetchCalled = false;
    window.fetch = () => {
      fetchCalled = true;
      return Promise.resolve(new Response('ok', { status: 200 }));
    };

    const result = await saveToDa({ path: 'https://da.live' });
    expect(result).to.equal(undefined);
    expect(fetchCalled).to.be.false;
  });

  it('Returns undefined without calling fetch when path does not start with /', async () => {
    let fetchCalled = false;
    window.fetch = () => {
      fetchCalled = true;
      return Promise.resolve(new Response('ok', { status: 200 }));
    };

    const result = await saveToDa({ path: 'org/repo/page' });
    expect(result).to.equal(undefined);
    expect(fetchCalled).to.be.false;
  });

  it('Returns undefined without calling fetch when path is falsy', async () => {
    let fetchCalled = false;
    window.fetch = () => {
      fetchCalled = true;
      return Promise.resolve(new Response('ok', { status: 200 }));
    };

    const result = await saveToDa({ path: null });
    expect(result).to.equal(undefined);
    expect(fetchCalled).to.be.false;
  });

  it('Proceeds normally when path is a valid relative path', async () => {
    let fetchCalled = false;
    window.fetch = () => {
      fetchCalled = true;
      return Promise.resolve(new Response('ok', { status: 200 }));
    };

    await saveToDa({ path: '/org/repo/page' });
    expect(fetchCalled).to.be.true;
  });
});
