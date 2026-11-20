import { expect } from '@esm-bundle/chai';
import { createBranchSource, getBranchApi } from '../../../../../blocks/shared/branch-selector/branch-api.js';

describe('branch Source adapter', () => {
  const context = { org: 'org', site: 'site', branch: 'work', siteSegment: 'site~work' };
  let requests;
  let source;
  beforeEach(() => {
    requests = [];
    source = createBranchSource(context, async (url, opts) => {
      requests.push({ url, opts });
      const options = { status: 200, headers: { 'da-continuation-token': 'next' } };
      return new Response(JSON.stringify([{ path: '/org/site~work/page.html' }]), options);
    });
  });

  it('routes reads and pagination only to the qualified da-rs site', async () => {
    const list = await source.list('/org/site~work/folder', { continuationToken: 'prev' });
    expect(requests[0].url).to.equal('https://admin.da.live/list/org/site~work/folder');
    expect(requests[0].opts.headers['da-continuation-token']).to.equal('prev');
    expect(list.continuationToken).to.equal('next');
    expect(list.items[0].path).to.equal('/org/site~work/page.html');
    await source.getMetadata('/org/site~work/page.html');
    expect(requests[1].opts.method).to.equal('HEAD');
  });

  it('writes JSON as multipart to the qualified Source', async () => {
    await source.save('/org/site~work/data.json', { body: '{"data":[]}' });
    expect(requests[0].url).to.equal('https://admin.da.live/source/org/site~work/data.json');
    expect(requests[0].opts.body.get('data').type).to.equal('application/json');
  });

  it('rejects cross-branch or unscoped operations without issuing a request', () => {
    expect(() => source.get('/org/site/page.html')).to.throw();
    expect(() => source.copy('/org/site~work/page.html', { destination: '/org/site/page.html' })).to.throw();
    expect(() => source.move('/org/site~work/page.html', { destination: '/org/site~other/page.html' })).to.throw();
    expect(() => source.deleteFolder('/org/site~work/folder')).to.throw();
    expect(requests).to.have.length(0);
  });

  it('refuses to insert the backend’s bare-site media URL into branch content', async () => {
    const body = { source: { contentUrl: 'https://content.da.live/org/site/.page/image.png' } };
    const fetcher = async () => new Response(JSON.stringify(body), { status: 201 });
    const unsafe = createBranchSource(context, fetcher);
    const response = await unsafe.uploadMedia('/org/site~work/.page/image.png', { body: new Blob(['x']) });
    expect(response.status).to.equal(422);
  });

  it('uploads to a new qualified media sibling and returns the portable relative reference', async () => {
    const calls = [];
    const fetcher = async (url, opts) => {
      calls.push({ url, opts });
      const sourceUrl = new URL(url).pathname;
      const filename = sourceUrl.split('/').pop();
      const body = { source: { sourceUrl, contentUrl: `./${filename}` } };
      return new Response(JSON.stringify(body), { status: 201, headers: { 'Content-Branch': 'work' } });
    };
    const branch = createBranchSource(context, fetcher);
    const file = new File(['image'], 'image #1.png', { type: 'image/png' });
    const response = await branch.uploadMedia('/org/site~work/dir/.page/image%20%231.png', { body: file });
    expect(response.status).to.equal(201);
    expect(calls[0].url).to.match(/^https:\/\/admin\.da\.live\/source\/org\/site~work\/dir\/media_[a-f0-9]{32}\.png$/);
    expect(calls[0].opts.headers['If-None-Match']).to.equal('*');
    expect(calls[0].opts.body.get('data').type).to.equal('image/png');
    expect((await response.json()).source.contentUrl).to.equal(`./${calls[0].url.split('/').pop()}`);
  });

  it('rejects traversal and nested encoded separators before sending an upload', async () => {
    const file = new File(['image'], 'test.png', { type: 'image/png' });
    const paths = [
      '/org/site~work/.page/%2e%2e',
      '/org/site~work/.page/foo%2fother.png',
      '/org/site~work/.page/foo%252fother.png',
      '/org/site~work/../.page/foo.png',
      '/org/site~other/.page/foo.png',
    ];
    for (const path of paths) {
      let failed = false;
      try {
        // eslint-disable-next-line no-await-in-loop
        await source.uploadMedia(path, { body: file });
      } catch { failed = true; }
      expect(failed, path).to.equal(true);
    }
    expect(requests).to.have.length(0);
  });

  it('rejects an upload for a different document or folder', async () => {
    const fetcher = async () => { throw new Error('Unexpected request'); };
    const options = { documentHash: '#/org/site~work/dir/page' };
    const branch = createBranchSource(context, fetcher, options);
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    for (const path of ['/org/site~work/dir/.other/photo.png', '/org/site~work/other/.page/photo.png']) {
      let failed = false;
      try {
        // eslint-disable-next-line no-await-in-loop
        await branch.uploadMedia(path, { body: file });
      } catch { failed = true; }
      expect(failed, path).to.equal(true);
    }
  });

  it('refuses a response for a different source path or relative media name', async () => {
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    const fetcher = async (url) => {
      const sourceUrl = new URL(url).pathname.replace('site~work', 'site~other');
      const filename = sourceUrl.split('/').pop();
      const options = { status: 201, headers: { 'Content-Branch': 'work' } };
      return new Response(JSON.stringify({ source: { sourceUrl, contentUrl: `./${filename}` } }), options);
    };
    const branch = createBranchSource(context, fetcher);
    expect((await branch.uploadMedia('/org/site~work/.page/photo.png', { body: file })).status).to.equal(422);
  });

  it('rejects a response with an absolute or mismatched content URL', async () => {
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    const fetcher = async (url) => {
      const sourceUrl = new URL(url).pathname;
      const body = { source: { sourceUrl, contentUrl: 'https://other.example/media_bad.png' } };
      return new Response(JSON.stringify(body), { status: 201, headers: { 'Content-Branch': 'work' } });
    };
    const branch = createBranchSource(context, fetcher);
    expect((await branch.uploadMedia('/org/site~work/.page/photo.png', { body: file })).status).to.equal(422);
  });

  it('rejects a successful upload response without the selected Content-Branch', async () => {
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    const fetcher = async (url) => {
      const sourceUrl = new URL(url).pathname;
      const body = { source: { sourceUrl, contentUrl: `./${sourceUrl.split('/').pop()}` } };
      return new Response(JSON.stringify(body), { status: 201, headers: { 'Content-Branch': 'main' } });
    };
    const branch = createBranchSource(context, fetcher);
    expect((await branch.uploadMedia('/org/site~work/.page/photo.png', { body: file })).status).to.equal(422);
  });

  it('discards an upload result if its document context changes before the response', async () => {
    let resolveResponse;
    let current = true;
    const fetcher = (url) => new Promise((resolve) => {
      resolveResponse = () => {
        const sourceUrl = new URL(url).pathname;
        const filename = sourceUrl.split('/').pop();
        const options = { status: 201, headers: { 'Content-Branch': 'work' } };
        resolve(new Response(JSON.stringify({ source: { sourceUrl, contentUrl: `./${filename}` } }), options));
      };
    });
    const branch = createBranchSource(context, fetcher, { isCurrent: () => current });
    const pending = branch.uploadMedia('/org/site~work/.page/photo.png', { body: new Blob(['x']) });
    current = false;
    resolveResponse();
    expect((await pending).status).to.equal(409);
  });

  it('keeps generic Source media saves and reads at their requested paths', async () => {
    const calls = [];
    const fetcher = async (url, opts) => {
      calls.push(url);
      const body = opts.method === 'POST' ? JSON.stringify({ source: { sourceUrl: new URL(url).pathname } }) : 'image';
      return new Response(body, { status: 200, headers: { 'Content-Branch': 'work' } });
    };
    const branch = createBranchSource(context, fetcher);
    const file = new File(['media'], 'photo.png', { type: 'image/png' });
    const pdf = new File(['pdf'], 'brochure.pdf', { type: 'application/pdf' });
    expect((await branch.save('/org/site~work/assets/photo.png', { body: file })).ok).to.equal(true);
    expect((await branch.get('/org/site~work/assets/photo.png')).ok).to.equal(true);
    expect((await branch.save('/org/site~work/assets/brochure.pdf', { body: pdf })).ok).to.equal(true);
    expect((await branch.get('/org/site~work/assets/brochure.pdf')).ok).to.equal(true);
    expect(calls).to.deep.equal([
      'https://admin.da.live/source/org/site~work/assets/photo.png',
      'https://admin.da.live/source/org/site~work/assets/photo.png',
      'https://admin.da.live/source/org/site~work/assets/brochure.pdf',
      'https://admin.da.live/source/org/site~work/assets/brochure.pdf',
    ]);
  });

  it('rejects generic media reads and writes that report a different branch', async () => {
    const fetcher = async () => new Response('body', { status: 200, headers: { 'Content-Branch': 'main' } });
    const branch = createBranchSource(context, fetcher);
    expect((await branch.get('/org/site~work/assets/photo.png')).status).to.equal(422);
    expect((await branch.save('/org/site~work/assets/photo.png', { body: new Blob(['x']) })).status).to.equal(422);
  });

  it('rejects media responses from a different origin without following them', async () => {
    const fetcher = async () => ({
      ok: true,
      headers: new Headers({ 'Content-Branch': 'work' }),
      redirected: true,
      url: 'https://other.example/media.png',
    });
    const branch = createBranchSource(context, fetcher);
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    expect((await branch.get('/org/site~work/assets/photo.png')).status).to.equal(422);
    expect((await branch.uploadMedia('/org/site~work/.page/photo.png', { body: file })).status).to.equal(422);
  });

  it('does not send a generic media read or write after its context changes', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return new Response('');
    };
    const branch = createBranchSource(context, fetcher, { isCurrent: () => false });
    expect((await branch.get('/org/site~work/assets/photo.png')).status).to.equal(409);
    expect((await branch.save('/org/site~work/assets/photo.png', { body: new Blob(['x']) })).status).to.equal(409);
    expect(calls).to.equal(0);
  });
});

describe('branch API binding', () => {
  let originalHash;
  let originalFetch;
  beforeEach(() => {
    originalHash = window.location.hash;
    originalFetch = window.fetch;
    window.location.hash = '#/bindingorg/bindingsite~work/page';
  });
  afterEach(() => {
    window.fetch = originalFetch;
    window.location.hash = originalHash;
  });

  it('validates capabilities and metadata before using da-rs, not the nx2 fallback', async () => {
    const calls = [];
    window.fetch = async (url) => {
      calls.push(url);
      if (url.endsWith('/capabilities')) {
        return new Response(JSON.stringify({
          supported: true,
          apiVersion: 1,
          defaultBranchId: 'main',
          addressing: 'site-suffix',
          separator: '~',
          operations: ['create', 'changes', 'sync', 'publish', 'revert', 'restore'],
          itemKinds: ['html', 'json', 'media', 'config'],
          branchScopedSource: true,
          branchScopedCollaboration: true,
        }), { status: 200 });
      }
      if (url.endsWith('/work')) return new Response('{"id":"work"}', { status: 200 });
      return new Response('body', { status: 200 });
    };
    let fallbackCalls = 0;
    const base = { source: { get: () => { fallbackCalls += 1; } }, config: {} };
    const api = await getBranchApi(Promise.resolve(base));
    await api.source.get('/bindingorg/bindingsite~work/page.html');
    expect(fallbackCalls).to.equal(0);
    expect(calls).to.deep.equal([
      'https://admin.da.live/branches/bindingorg/bindingsite/capabilities',
      'https://admin.da.live/branches/bindingorg/bindingsite/work',
      'https://admin.da.live/source/bindingorg/bindingsite~work/page.html',
    ]);
    expect(() => api.aem.publish('/bindingorg/bindingsite~work/page')).to.throw();
  });
});
