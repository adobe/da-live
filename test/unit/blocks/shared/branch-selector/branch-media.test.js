import { expect } from '@esm-bundle/chai';
import { createBranchMediaRenderer, MEDIA_PLACEHOLDER } from '../../../../../blocks/shared/branch-selector/branch-media.js';

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('branch media renderer', () => {
  let originalUrl;
  let createObjectURL;
  let revokeObjectURL;
  let created;
  let revoked;
  let host;
  let renderer;
  beforeEach(() => {
    originalUrl = window.location.href;
    history.replaceState(null, '', '#/org/site~work/dir/page');
    createObjectURL = URL.createObjectURL;
    revokeObjectURL = URL.revokeObjectURL;
    created = [];
    revoked = [];
    URL.createObjectURL = (blob) => {
      created.push(blob);
      return `blob:test-${created.length}`;
    };
    URL.revokeObjectURL = (url) => revoked.push(url);
    host = document.createElement('div');
  });
  afterEach(() => {
    renderer?.destroy();
    renderer = undefined;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    history.replaceState(null, '', originalUrl);
  });

  const context = { org: 'org', repo: 'site~work', path: '/org/site~work/dir/page' };
  const image = (src) => {
    const img = document.createElement('img');
    img.setAttribute('src', src);
    host.append(img);
    return img;
  };

  it('fetches a safely encoded name from the qualified Source and revokes removed blobs', async () => {
    const calls = [];
    const fetcher = async (url, opts) => {
      calls.push({ url, opts });
      const headers = { 'Content-Type': 'image/png', 'Content-Branch': 'work' };
      return new Response('png', { status: 200, headers });
    };
    const img = image('./media_a%20b%23.png');
    renderer = createBranchMediaRenderer(context, fetcher);
    renderer.update({ dom: host });
    expect(img.getAttribute('src')).to.equal(MEDIA_PLACEHOLDER);
    for (let attempt = 0; attempt < 20 && !created.length; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      await nextFrame();
    }
    expect(calls[0].url).to.equal('https://admin.da.live/source/org/site~work/dir/media_a%20b%23.png');
    expect(calls[0].opts.redirect).to.equal('error');
    expect(calls[0].opts.noRedirect).to.equal(true);
    expect(created[0].type).to.equal('image/png');
    expect(img.getAttribute('src')).to.equal('blob:test-1');
    img.remove();
    renderer.update({ dom: host });
    expect(revoked).to.deep.equal(['blob:test-1']);
  });

  it('keeps invalid media names, unsafe MIME and other origins as placeholders', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      const headers = { 'Content-Type': 'text/html', 'Content-Branch': 'work' };
      return new Response('<html></html>', { status: 200, headers });
    };
    const invalid = image('./media_bad%252fother.png');
    const html = image('./media_bad.png');
    renderer = createBranchMediaRenderer(context, fetcher);
    renderer.update({ dom: host });
    await nextFrame();
    expect(calls).to.equal(1);
    expect(created).to.have.length(0);
    expect(invalid.getAttribute('src')).to.equal(MEDIA_PLACEHOLDER);
    expect(html.getAttribute('src')).to.equal(MEDIA_PLACEHOLDER);
  });

  it('rejects a Source response for Default even when its MIME is an image', async () => {
    const fetcher = async () => {
      const headers = { 'Content-Type': 'image/png', 'Content-Branch': 'main' };
      return new Response('png', { status: 200, headers });
    };
    const img = image('./media_wrong.png');
    renderer = createBranchMediaRenderer(context, fetcher);
    renderer.update({ dom: host });
    await nextFrame();
    expect(created).to.have.length(0);
    expect(img.getAttribute('src')).to.equal(MEDIA_PLACEHOLDER);
  });

  it('does not forward media query parameters to Source', async () => {
    const calls = [];
    const fetcher = async (url) => {
      calls.push(url);
      const headers = { 'Content-Type': 'image/png', 'Content-Branch': 'work' };
      return new Response('png', { status: 200, headers });
    };
    image('./media_photo.png?contentBranch=main#fragment');
    renderer = createBranchMediaRenderer(context, fetcher);
    renderer.update({ dom: host });
    await nextFrame();
    expect(calls).to.deep.equal(['https://admin.da.live/source/org/site~work/dir/media_photo.png']);
  });

  it('rejects a redirected response rather than displaying bytes from another origin', async () => {
    const headers = new Headers({ 'Content-Type': 'image/png', 'Content-Branch': 'work' });
    const fetcher = async () => ({ ok: true, headers, redirected: true, url: 'https://elsewhere.test/image' });
    const img = image('./media_redirect.png');
    renderer = createBranchMediaRenderer(context, fetcher);
    renderer.update({ dom: host });
    await nextFrame();
    expect(created).to.have.length(0);
    expect(img.getAttribute('src')).to.equal(MEDIA_PLACEHOLDER);
  });

  it('does not use a pending response after changing the document context', async () => {
    let resolveFetch;
    const fetcher = () => new Promise((resolve) => { resolveFetch = resolve; });
    const img = image('./media_wait.png');
    renderer = createBranchMediaRenderer(context, fetcher);
    renderer.update({ dom: host });
    history.replaceState(null, '', '#/org/site~work/dir/other');
    const headers = { 'Content-Type': 'image/png', 'Content-Branch': 'work' };
    resolveFetch(new Response('png', { status: 200, headers }));
    await nextFrame();
    expect(created).to.have.length(0);
    expect(img.getAttribute('src')).to.equal(MEDIA_PLACEHOLDER);
  });

  it('aborts pending reads and revokes displayed blobs on hash navigation and teardown', async () => {
    const calls = [];
    const fetcher = async (url, opts) => {
      calls.push({ url, opts });
      const headers = { 'Content-Type': 'image/png', 'Content-Branch': 'work' };
      return new Response('png', { status: 200, headers });
    };
    const img = image('./media_first.png');
    renderer = createBranchMediaRenderer(context, fetcher);
    renderer.update({ dom: host });
    await nextFrame();
    history.replaceState(null, '', '#/org/site~other/dir/page');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(calls[0].opts.signal.aborted).to.equal(true);
    expect(img.getAttribute('src')).to.equal(MEDIA_PLACEHOLDER);
    expect(revoked).to.deep.equal(['blob:test-1']);
  });
});
