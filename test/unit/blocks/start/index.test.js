import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { copyConfig, copyContent, previewContent } = await import('../../../../blocks/start/index.js');

describe('start/index copyConfig', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; globalThis.__crawlMock = undefined; });

  it('Replaces sourcePath in config text and PUTs to dest config', async () => {
    let getCalled = false;
    let putBody;
    let putUrl;
    window.fetch = (url, opts) => {
      if (opts?.method === 'PUT') {
        putUrl = url;
        putBody = opts.body;
        return Promise.resolve(new Response('', { status: 200 }));
      }
      getCalled = true;
      return Promise.resolve(new Response('refers to /source/path/data', { status: 200 }));
    };
    const resp = await copyConfig('/source/path', 'newOrg', 'newSite');
    expect(getCalled).to.be.true;
    expect(putUrl).to.contain('/config/newOrg/newSite/');
    expect(resp.ok).to.be.true;
    const config = putBody.get('config');
    expect(config).to.equal('refers to /newOrg/newSite/data');
  });

  it('Returns { ok: false } when source config is missing', async () => {
    window.fetch = () => Promise.resolve(new Response('', { status: 404 }));
    const resp = await copyConfig('/source/path', 'newOrg', 'newSite');
    expect(resp.ok).to.be.false;
  });
});

describe('start/index copyContent', () => {
  let savedFetch;

  beforeEach(() => {
    savedFetch = window.fetch;
    globalThis.__crawlMock = (conf) => ({
      results: (async () => {
        const files = [
          { path: '/source/page.html' },
          { path: '/source/data.json' },
          { path: '/source/icon.svg' },
          { path: '/source/binary.png' },
          { path: '/source/drafts/skip.html' },
        ];
        for (const file of files) {
          // eslint-disable-next-line no-await-in-loop
          await conf.callback(file);
        }
        return files;
      })(),
    });
  });

  afterEach(() => {
    window.fetch = savedFetch;
    globalThis.__crawlMock = undefined;
  });

  it('Skips drafts and copies html/json/svg/binary', async () => {
    const fetched = [];
    window.fetch = (url, opts) => {
      fetched.push({ url, method: opts?.method });
      if (opts?.method === 'POST') return Promise.resolve(new Response('', { status: 200 }));
      // GET — return text or blob-like response
      return Promise.resolve(new Response('hi /source/page', { status: 200 }));
    };
    const status = [];
    const results = await copyContent('/source', 'org', 'site', (s) => status.push(s));

    // 4 files (drafts skipped) → each should produce a GET + a POST
    expect(results).to.have.length(5);
    const drafts = results.find((f) => f.path.includes('/drafts/'));
    expect(drafts.ok).to.equal(undefined); // never copied
    const others = results.filter((f) => !f.path.includes('/drafts/'));
    others.forEach((file) => {
      expect(file.ok).to.be.true;
    });
    // The destination URLs should be rewritten with /org/site
    expect(fetched.some((c) => c.url.includes('/source/org/site/page.html') && c.method === 'POST')).to.be.true;
    // setStatus called for each non-draft
    expect(status.length).to.equal(4);
  });
});

describe('start/index previewContent', () => {
  let savedFetch;

  beforeEach(() => {
    savedFetch = window.fetch;
    globalThis.__crawlMock = (conf) => ({
      results: (async () => {
        const files = [
          { path: '/org/site/page.html' },
          { path: '/org/site/icon.svg' },
          { path: '/org/site/data.json' },
          { path: '/org/site/binary.png' },
          { path: '/org/site/docs/library/index.html' },
        ];
        for (const file of files) {
          // eslint-disable-next-line no-await-in-loop
          await conf.callback(file);
        }
        return files;
      })(),
    });
  });

  afterEach(() => {
    window.fetch = savedFetch;
    globalThis.__crawlMock = undefined;
  });

  it('Filters by extension and excludes docs/library, then bulk-previews', async () => {
    let captured;
    window.fetch = (url, opts) => {
      captured = { url, opts };
      return Promise.resolve(new Response('{}', { status: 200 }));
    };
    const status = [];
    const result = await previewContent('org', 'site', (s) => status.push(s));
    expect(result).to.include({ type: 'success' });
    expect(captured.url).to.contain('/preview/org/site/main/*');
    const body = JSON.parse(captured.opts.body);
    expect(body.forceUpdate).to.be.true;
    expect(body.forceSync).to.be.true;
    // png excluded; library excluded; html, svg, json kept
    expect(body.paths.sort()).to.deep.equal(['/data.json', '/icon.svg', '/page'].sort());
    expect(status[0]).to.equal('Bulk previewing content.');
  });

  it('Returns error type when bulk preview fails', async () => {
    window.fetch = () => Promise.resolve(new Response('', { status: 500 }));
    const result = await previewContent('org', 'site', () => {});
    expect(result.type).to.equal('error');
    expect(result.status).to.equal(500);
  });
});
