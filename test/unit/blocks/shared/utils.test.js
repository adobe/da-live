import { expect } from '@esm-bundle/chai';
import {
  daFetch,
  etcFetch,
  aemAdmin,
  saveToDa,
  getSheetByIndex,
  getFirstSheet,
  checkLockdownImages,
  delay,
  getSidekickConfig,
  sanitizeName,
} from '../../../../blocks/shared/utils.js';

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

describe('daFetch', () => {
  let savedFetch;
  let savedLocalStorage;

  beforeEach(() => {
    savedFetch = window.fetch;
    savedLocalStorage = window.localStorage.getItem('nx-ims');
  });

  afterEach(() => {
    window.fetch = savedFetch;
    if (savedLocalStorage) {
      window.localStorage.setItem('nx-ims', savedLocalStorage);
    } else {
      window.localStorage.removeItem('nx-ims');
    }
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

describe('checkLockdownImages', () => {
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

  it('Returns true when lockdownImages flag is enabled', async () => {
    const body = JSON.stringify({ flags: { data: [{ key: 'lockdownImages', value: 'true' }] } });
    window.fetch = () => Promise.resolve(new Response(body, { status: 200 }));

    const result = await checkLockdownImages('testowner');
    expect(result).to.be.true;
  });

  it('Returns false when lockdownImages flag is not present', async () => {
    const body = JSON.stringify({ flags: { data: [{ key: 'otherFlag', value: 'true' }] } });
    window.fetch = () => Promise.resolve(new Response(body, { status: 200 }));

    const result = await checkLockdownImages('testowner');
    expect(result).to.be.false;
  });

  it('Returns false when lockdownImages value is not true', async () => {
    const body = JSON.stringify({ flags: { data: [{ key: 'lockdownImages', value: 'false' }] } });
    window.fetch = () => Promise.resolve(new Response(body, { status: 200 }));

    const result = await checkLockdownImages('testowner');
    expect(result).to.be.false;
  });

  it('Returns false when flags sheet does not exist', async () => {
    window.fetch = () => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));

    const result = await checkLockdownImages('testowner');
    expect(result).to.be.false;
  });

  it('Returns false when config fetch fails', async () => {
    window.fetch = () => Promise.resolve(new Response('error', { status: 500 }));

    const result = await checkLockdownImages('testowner');
    expect(result).to.be.false;
  });

  it('Returns false when fetch throws', async () => {
    window.fetch = () => Promise.reject(new Error('network error'));

    const result = await checkLockdownImages('testowner');
    expect(result).to.be.false;
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
