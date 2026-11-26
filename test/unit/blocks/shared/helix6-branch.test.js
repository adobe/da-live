import { expect } from '@esm-bundle/chai';
import { setNx, getNx2Api } from '../../../../scripts/utils.js';
import { DA_ORIGIN } from '../../../../blocks/shared/constants.js';
import { invalidateDaRsDiscovery, provisionDaRsSite } from '../../../../blocks/shared/da-rs-provider.js';
import { defaultSourceMatchesBinding, invalidateBranchingDiscovery, validateBranch } from '../../../../blocks/shared/branch-selector/context.js';
import { switchContentBranch } from '../../../../blocks/shared/branch-selector/navigation.js';
import { saveToDa } from '../../../../blocks/shared/utils.js';
import { createDaRsSnapshot } from '../../../../blocks/canvas/ew-canvas-versions/da-rs-snapshot.js';
import { createDaRsImageView, createDaRsMediaRenderer } from '../../../../blocks/canvas/ew-editor-doc/prose-plugins/daRsMedia.js';
import { MEDIA_PLACEHOLDER } from '../../../../blocks/shared/branch-selector/branch-media.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const capabilities = (enabled = true) => ({
  supported: true,
  apiVersion: 1,
  defaultBranchId: 'main',
  addressing: 'site-suffix',
  separator: '~',
  operations: ['create', 'changes', 'sync', 'publish', 'revert', 'restore'],
  itemKinds: ['html', 'json', 'media', 'config'],
  branchScopedSource: true,
  branchScopedCollaboration: true,
  helix6BranchSource: enabled,
});

describe('bound Helix 6 branch transport', () => {
  let originalUrl;
  let originalFetch;
  let calls;
  let mode;
  let enabled;
  let metadata;
  let sourceStatus;

  beforeEach(() => {
    originalUrl = window.location.href;
    originalFetch = window.fetch;
    const url = new URL(originalUrl);
    url.searchParams.set('da-source', 'da-rs');
    url.hash = '#/h6test/work~draft/page';
    window.history.replaceState(null, '', url);
    invalidateDaRsDiscovery();
    calls = [];
    mode = 'helix6';
    enabled = true;
    metadata = { id: 'draft', revision: 1 };
    sourceStatus = 201;
    window.fetch = async (target, options = {}) => {
      calls.push({ target, options });
      if (target.endsWith('/ping/h6test/work')) {
        return new Response('', { headers: mode === 'helix6' ? { 'x-api-upgrade-available': 'true' } : {} });
      }
      if (target.endsWith('/branches/h6test/work/capabilities')) {
        return new Response(JSON.stringify(capabilities(enabled)));
      }
      if (target.endsWith('/branches/h6test/work/draft')) return new Response(JSON.stringify(metadata));
      if (options.method === 'HEAD') {
        return new Response(null, {
          headers: {
            'content-branch': 'draft',
            'x-da-source-mode': 'helix6',
            etag: '"draft-item:1"',
            'x-da-actions': '/work/page.html=read,write',
          },
        });
      }
      if (target.endsWith('/source/') || target.endsWith('/source/.trash/')) {
        return new Response(JSON.stringify([{ name: 'page.html', 'content-type': 'text/html' }]));
      }
      if (target.endsWith('/.versions')) return new Response(JSON.stringify([{ version: 'v1', 'version-date': '2026-01-01T00:00:00Z' }]));
      if (target.endsWith('/.history')) return new Response(JSON.stringify({ entries: [] }));
      if (options.method === 'POST' && target.includes('/media_')) {
        return new Response('', { status: 201, headers: { 'content-branch': 'draft' } });
      }
      return new Response('', { status: sourceStatus });
    };
  });

  afterEach(() => {
    window.fetch = originalFetch;
    window.history.replaceState(null, '', originalUrl);
    invalidateDaRsDiscovery();
  });

  it('uses the frozen qualified Source and DA config, preserving raw bytes and validators', async () => {
    const api = await getNx2Api();
    expect(await api.isHlx6('h6test', 'work~draft')).to.equal(true);
    const root = `${DA_ORIGIN}/h6test/sites/work~draft/source`;
    const list = await api.source.list('/h6test/work~draft');
    expect(list.items[0].path).to.equal('/h6test/work~draft/page.html');
    await api.source.getMetadata('/h6test/work~draft/page.html');
    await api.source.save('/h6test/work~draft/data.json', { body: '{"data":[]}' });
    await api.source.replace('/h6test/work~draft/page.html', { body: '<main>x</main>', ifMatch: '"draft-item:1"' });
    await api.source.copy('/h6test/work~draft/page.html', { destination: '/h6test/work~draft/copy.html' });
    await api.source.delete('/h6test/work~draft/page.html');
    await api.config.get('/h6test/work~draft');
    const targets = calls.map(({ target }) => target);
    expect(targets).to.include(`${root}/`);
    expect(targets).to.include(`${root}/page.html`);
    expect(targets).to.include(`${DA_ORIGIN}/config/h6test/work~draft/`);
    const post = calls.find(({ target }) => target === `${root}/data.json`);
    expect(post.options.method).to.equal('POST');
    expect(post.options.body).to.equal('{"data":[]}');
    expect(post.options.headers['Content-Type']).to.equal('application/json');
    const put = calls.find(({ options }) => options.method === 'PUT' && options.body === '<main>x</main>');
    expect(put.options.headers['If-Match']).to.equal('"draft-item:1"');
    const copy = calls.find(({ target }) => target.includes('copy.html?'));
    expect(copy.options.method).to.equal('PUT');
    expect(new URL(copy.target).searchParams.get('source')).to.equal('/page.html');
    expect(calls.every(({ target }) => new URL(target).origin === DA_ORIGIN)).to.equal(true);
  });

  it('encodes Author render and image options as Source query parameters', async () => {
    window.history.replaceState(null, '', '/edit?da-source=da-rs#/h6test/work/page');
    invalidateDaRsDiscovery();
    const api = await getNx2Api();
    const path = '/h6test/work/page.html';
    await api.source.get(path, undefined, { render: 'author' });
    const resource = '/content/wknd/page/_jcr_content/image.coreimg.jpeg/123/a.jpeg';
    await api.source.get(path, undefined, { render: 'author-image', resource });
    const requests = calls.filter(({ target }) => target.includes('/source/page.html?'));
    expect(requests).to.have.length(2);
    expect(new URL(requests[0].target).searchParams.get('render')).to.equal('author');
    expect(new URL(requests[1].target).searchParams.get('render')).to.equal('author-image');
    expect(new URL(requests[1].target).searchParams.get('resource'))
      .to.equal('/content/wknd/page/_jcr_content/image.coreimg.jpeg/123/a.jpeg');
    expect(requests[1].options).not.to.have.property('resource');
  });

  it('keeps qualified history, trash listing, snapshot and media on the same branch', async () => {
    const api = await getNx2Api();
    const path = '/h6test/work~draft/page.html';
    const base = `${DA_ORIGIN}/h6test/sites/work~draft/source`;
    const list = await api.versions.list(path);
    expect((await list.json())[0].version).to.equal('v1');
    await api.versions.history(path);
    await api.versions.get(path, { versionId: 'v1' });
    await api.versions.create(path, { operation: 'version', comment: 'saved', ifMatch: '"draft-item:1"' });
    await api.source.list('/h6test/work~draft/.trash');
    const image = new File(['image'], 'photo.png', { type: 'image/png' });
    const uploaded = await api.source.uploadMedia('/h6test/work~draft/.page/photo.png', { body: image });
    expect((await uploaded.json()).source.contentUrl).to.match(/^\.\/media_[a-f0-9]{32}\.png$/);
    const upload = calls.find(({ target }) => target.includes('/media_'));
    expect(upload.target).to.match(new RegExp(`^${base}/media_`));
    expect(upload.options.body).to.equal(image);
    expect(upload.options.headers['If-None-Match']).to.equal('*');
    const snapshot = calls.find(({ target }) => target.includes('/.versions?'));
    expect(snapshot.options.headers['If-Match']).to.equal('"draft-item:1"');
    expect(new URL(snapshot.target).searchParams.get('operation')).to.equal('version');
    expect(calls.some(({ target }) => target === `${base}/.trash/`)).to.equal(true);
  });

  it('requires both capabilities and matching branch metadata before any Source request', async () => {
    enabled = false;
    try {
      await getNx2Api();
      throw new Error('expected denial');
    } catch (error) {
      expect(error.message).to.include('unavailable');
    }
    expect(calls.some(({ target }) => target.includes('/source/'))).to.equal(false);
    enabled = true;
    metadata = { id: 'other' };
    try {
      await getNx2Api();
      throw new Error('expected denial');
    } catch (error) {
      expect(error.message).to.include('does not match');
    }
    expect(calls.some(({ target }) => target.includes('/source/'))).to.equal(false);
  });

  it('offers Default switching only with the H6 extension and rejects a denied switch before flushing', async () => {
    window.history.replaceState(null, '', '#/h6test/work/page');
    enabled = false;
    expect(await defaultSourceMatchesBinding('h6test', 'work')).to.equal(false);
    let flushed = false;
    let navigated = false;
    try {
      await switchContentBranch('draft', {
        root: { querySelector: () => null },
        flush: async () => { flushed = true; return { ok: true }; },
        navigate: () => { navigated = true; },
      });
      throw new Error('expected denial');
    } catch (error) { expect(error.message).to.include('unavailable'); }
    expect(flushed).to.equal(false);
    expect(navigated).to.equal(false);
    enabled = true;
    expect(await defaultSourceMatchesBinding('h6test', 'work')).to.equal(true);
  });

  it('retains the qualified DA adapter for a bound legacy control', async () => {
    mode = 'legacy';
    const api = await getNx2Api();
    expect(await api.isHlx6('h6test', 'work~draft')).to.equal(false);
    await api.source.save('/h6test/work~draft/page.html', { body: 'legacy' });
    const write = calls.at(-1);
    expect(write.target).to.equal(`${DA_ORIGIN}/source/h6test/work~draft/page.html`);
    expect(write.options.body).to.be.instanceOf(FormData);
  });

  it('creates a legacy branch version through the DA version endpoint without a Canvas session', async () => {
    mode = 'legacy';
    const api = await getNx2Api();
    const ok = await createDaRsSnapshot({
      path: '/h6test/work~draft/page.html',
      label: 'saved',
      isCurrent: () => true,
      getApi: async () => api,
    });
    expect(ok).to.equal(true);
    const write = calls.at(-1);
    expect(write.target).to.equal(`${DA_ORIGIN}/versionsource/h6test/work~draft/page.html`);
    expect(write.options.method).to.equal('POST');
    expect(JSON.parse(write.options.body)).to.deep.equal({ label: 'saved' });
  });

  it('keeps bound Default H6 and unbound DA branches on their respective transports', async () => {
    window.history.replaceState(null, '', '#/h6test/work/page');
    const bound = await getNx2Api();
    await bound.source.getMetadata('/h6test/work/page.html');
    expect(calls.at(-1).target).to.equal(`${DA_ORIGIN}/h6test/sites/work/source/page.html`);
    const unbound = new URL(window.location.href);
    unbound.searchParams.delete('da-source');
    unbound.hash = '#/h6test/work~draft/page';
    window.history.replaceState(null, '', unbound);
    const api = await getNx2Api();
    await api.source.getMetadata('/h6test/work~draft/page.html');
    expect(calls.at(-1).target).to.equal(`${DA_ORIGIN}/source/h6test/work~draft/page.html`);
  });

  it('flushes before taking an exact-validator branch snapshot', async () => {
    const api = await getNx2Api();
    const view = { editable: true, state: { doc: {} } };
    const session = { view, wsProvider: {} };
    let flushed = false;
    const editor = {
      getComparisonSession: () => session,
      saveForComparison: async () => { flushed = true; return { ok: true }; },
    };
    const result = await createDaRsSnapshot({
      path: '/h6test/work~draft/page.html',
      label: 'saved',
      view,
      editor,
      isCurrent: () => true,
      getApi: async () => api,
    });
    expect(result).to.equal(true);
    expect(flushed).to.equal(true);
    const snapshot = calls.find(({ target }) => target.includes('/.versions?'));
    expect(snapshot.options.headers['If-Match']).to.equal('"draft-item:1"');
    expect(calls.findIndex(({ options }) => options.method === 'HEAD')).to.be.lessThan(calls.indexOf(snapshot));
  });

  it('renders local branch images through authenticated qualified H6 Source', async () => {
    const fetcher = window.fetch;
    window.fetch = async (target, options) => {
      if (target.endsWith('/media_abc.png')) {
        calls.push({ target, options });
        return new Response('png', { headers: { 'content-type': 'image/png', 'content-branch': 'draft' } });
      }
      return fetcher(target, options);
    };
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    let done;
    const loaded = new Promise((resolve) => { done = resolve; });
    URL.createObjectURL = () => {
      done();
      return 'blob:branch';
    };
    URL.revokeObjectURL = () => {};
    const image = createDaRsImageView({ type: {}, attrs: { src: './media_abc.png' } });
    const dom = document.createElement('div');
    dom.append(image.dom);
    const renderer = createDaRsMediaRenderer({ org: 'h6test', repo: 'work~draft', path: 'h6test/work~draft/page' });
    try {
      renderer.update({ dom });
      await loaded;
      expect(image.dom.getAttribute('src')).to.equal('blob:branch');
      expect(calls.at(-1).target).to.equal(`${DA_ORIGIN}/h6test/sites/work~draft/source/media_abc.png`);
    } finally {
      renderer.destroy();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  it('uses the legacy branch media path and rejects a different branch response', async () => {
    mode = 'legacy';
    const fetcher = window.fetch;
    let badRequest;
    const badReceived = new Promise((resolve) => { badRequest = resolve; });
    window.fetch = (target, options) => {
      if (target.includes('/media_')) {
        calls.push({ target, options });
        const branch = target.endsWith('/media_bad.png') ? 'other' : 'draft';
        if (branch === 'other') badRequest();
        return Promise.resolve(new Response('png', { headers: { 'content-type': 'image/png', 'content-branch': branch } }));
      }
      return fetcher(target, options);
    };
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    let loaded;
    const goodLoaded = new Promise((resolve) => { loaded = resolve; });
    URL.createObjectURL = () => {
      loaded();
      return 'blob:legacy';
    };
    URL.revokeObjectURL = () => {};
    const good = document.createElement('img');
    good.setAttribute('src', './media_Mixed%20Name.png?view=1');
    const bad = document.createElement('img');
    bad.setAttribute('src', './media_bad.png');
    const dom = document.createElement('div');
    dom.append(good, bad);
    const renderer = createDaRsMediaRenderer({ org: 'h6test', repo: 'work~draft', path: 'h6test/work~draft/page' });
    try {
      renderer.update({ dom });
      await Promise.all([goodLoaded, badReceived]);
      await new Promise((resolve) => { setTimeout(resolve, 0); });
      expect(good.getAttribute('src')).to.equal('blob:legacy');
      expect(bad.getAttribute('src')).to.equal(MEDIA_PLACEHOLDER);
      expect(calls.some(({ target }) => target === `${DA_ORIGIN}/source/h6test/work~draft/media_mixed%20name.png`))
        .to.equal(true);
    } finally {
      renderer.destroy();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  it('does not fall back after 412, reject sibling paths or accept an old adapter after rebinding', async () => {
    const api = await getNx2Api();
    sourceStatus = 412;
    const response = await api.source.replace('/h6test/work~draft/page.html', { body: 'old', ifMatch: '"draft-item:1"' });
    expect(response.status).to.equal(412);
    const count = calls.length;
    try {
      await api.source.get('/h6test/work~other/page.html');
      throw new Error('expected denial');
    } catch (error) {
      expect(error.message).to.match(/Invalid|selected/);
    }
    const changed = new URL(window.location.href);
    changed.searchParams.set('da-admin', 'stage');
    window.history.replaceState(null, '', changed);
    try {
      await api.source.get('/h6test/work~draft/page.html');
      throw new Error('expected denial');
    } catch (error) {
      expect(error.message).to.include('context changed');
    }
    expect(calls).to.have.length(count);
  });

  it('pins the caller location before the adapter import can resolve', async () => {
    const rejectAfterNavigation = async (target) => {
      const before = calls.length;
      const pending = getNx2Api();
      window.history.replaceState(null, '', target);
      let error;
      try {
        await pending;
      } catch (caught) { error = caught; }
      expect(error?.message).to.include('context changed');
      expect(calls).to.have.length(before);
    };
    await rejectAfterNavigation('#/h6test/work/page');
    await rejectAfterNavigation('#/h6test/work~draft/page');
    await rejectAfterNavigation('#/h6test/work~other/page');
  });

  it('rejects a branch adapter if the location changes while awaiting its base API', async () => {
    const { getBranchApi } = await import('../../../../blocks/shared/branch-selector/branch-api.js');
    const fetcher = window.fetch;
    let metadataReceived;
    const waiting = new Promise((resolve) => { metadataReceived = resolve; });
    window.fetch = async (target, options) => {
      const response = await fetcher(target, options);
      if (target.endsWith('/branches/h6test/work/draft')) metadataReceived();
      return response;
    };
    let release;
    const base = new Promise((resolve) => { release = resolve; });
    const pending = getBranchApi(base);
    await waiting;
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    window.history.replaceState(null, '', '#/h6test/work~draft/other');
    release({});
    let error;
    try {
      await pending;
    } catch (caught) { error = caught; }
    expect(error?.message).to.include('context changed');
  });

  it('forces a new capability check before switching after a gate change', async () => {
    await getNx2Api();
    window.history.replaceState(null, '', '#/h6test/work/page');
    enabled = false;
    let flushed = false;
    let error;
    try {
      await switchContentBranch('draft', {
        root: { querySelector: () => null },
        flush: async () => { flushed = true; return { ok: true }; },
      });
    } catch (caught) { error = caught; }
    expect(error?.message).to.include('unavailable');
    expect(flushed).to.equal(false);
  });

  it('scopes config writes, provisioning and deletes to the selected branch', async () => {
    const api = await getNx2Api();
    await api.config.get('/h6test');
    await api.config.save('/h6test/work~draft', { body: '{}' });
    await api.source.delete('/h6test/work~draft/page.html');
    const count = calls.length;
    expect(() => api.config.save('/h6test', { body: '{}' })).to.throw('selected branch');
    expect(() => api.config.save('/h6test/work~other', { body: '{}' })).to.throw();
    let failed = false;
    try {
      await provisionDaRsSite('h6test', 'work');
    } catch { failed = true; }
    expect(failed).to.equal(true);
    failed = false;
    try {
      await api.source.delete('/h6test/work~other/page.html');
    } catch { failed = true; }
    expect(failed).to.equal(true);
    expect(calls).to.have.length(count);
    expect(calls.some(({ target, options }) => target === `${DA_ORIGIN}/config/h6test/work~draft/`
      && options.method === 'PUT')).to.equal(true);
    expect(calls.some(({ target, options }) => target.endsWith('/work~draft/source/page.html')
      && options.method === 'DELETE')).to.equal(true);
  });

  ['helix6', 'legacy'].forEach((selectedMode) => {
    it(`coalesces overlapping ${selectedMode} Canvas, editor, config, selector and media validation`, async () => {
      mode = selectedMode;
      const { buildSourceUrl, checkDoc } = await import('../../../../blocks/canvas/ew-editor-doc/utils/source.js');
      await getNx2Api(); // Warm dynamic imports before overlapping the actual requests.
      invalidateBranchingDiscovery();
      calls.length = 0;
      const fetcher = window.fetch;
      let release;
      let started;
      const waiting = new Promise((resolve) => { started = resolve; });
      window.fetch = (target, options) => {
        if (target.endsWith('/branches/h6test/work/capabilities')) {
          calls.push({ target, options });
          return new Promise((resolve) => {
            release = resolve;
            started();
          });
        }
        if (target.endsWith('/media_abc.png')) {
          calls.push({ target, options });
          return Promise.resolve(new Response('png', { headers: { 'content-type': 'image/png', 'content-branch': 'draft' } }));
        }
        return fetcher(target, options);
      };
      const originalCreate = URL.createObjectURL;
      const originalRevoke = URL.revokeObjectURL;
      let mediaLoaded;
      const loaded = new Promise((resolve) => { mediaLoaded = resolve; });
      URL.createObjectURL = () => {
        mediaLoaded();
        return 'blob:parallel';
      };
      URL.revokeObjectURL = () => {};
      const image = createDaRsImageView({ type: {}, attrs: { src: './media_abc.png' } });
      const dom = document.createElement('div');
      dom.append(image.dom);
      const renderer = createDaRsMediaRenderer({ org: 'h6test', repo: 'work~draft', path: 'h6test/work~draft/page' });
      const context = { org: 'h6test', site: 'work', branch: 'draft', siteSegment: 'work~draft' };
      const editor = getNx2Api();
      const config = getNx2Api().then((api) => api.config.get('/h6test/work~draft'));
      const canvas = buildSourceUrl('/h6test/work~draft/page').then(checkDoc);
      const selector = validateBranch(context);
      renderer.update({ dom });
      try {
        await waiting;
        await new Promise((resolve) => { setTimeout(resolve, 0); });
        expect(calls.filter(({ target }) => target.endsWith('/capabilities'))).to.have.length(1);
        release(new Response(JSON.stringify(capabilities())));
        const [api, configResponse, head, branch] = await Promise.all([
          editor, config, canvas, selector,
        ]);
        await loaded;
        expect(await api.isHlx6('h6test', 'work~draft')).to.equal(selectedMode === 'helix6');
        expect(configResponse.ok).to.equal(true);
        expect(head.ok).to.equal(true);
        expect(branch.branch.id).to.equal('draft');
        expect(calls.filter(({ target }) => target.endsWith('/capabilities'))).to.have.length(1);
        const expected = selectedMode === 'helix6'
          ? `${DA_ORIGIN}/h6test/sites/work~draft/source/media_abc.png`
          : `${DA_ORIGIN}/source/h6test/work~draft/media_abc.png`;
        expect(calls.some(({ target }) => target === expected)).to.equal(true);
      } finally {
        if (release) release(new Response(JSON.stringify(capabilities())));
        renderer.destroy();
        URL.createObjectURL = originalCreate;
        URL.revokeObjectURL = originalRevoke;
      }
    });
  });

  it('uses the qualified raw update helper and does not retry failed writes', async () => {
    sourceStatus = 412;
    try {
      await saveToDa({ path: '/h6test/work~draft/page.html', blob: new Blob(['old'], { type: 'text/html' }) });
      throw new Error('expected denial');
    } catch (error) { expect(error.message).to.include('412'); }
    const writes = calls.filter(({ options }) => options.method === 'PUT' || options.method === 'POST');
    expect(writes).to.have.length(1);
    expect(writes[0].target).to.equal(`${DA_ORIGIN}/h6test/sites/work~draft/source/page.html`);
    expect(writes[0].options.body).to.be.instanceOf(Blob);
  });

  it('routes Canvas HEAD to qualified H6 and validates branch and mode headers', async () => {
    const { buildSourceUrl, checkDoc } = await import('../../../../blocks/canvas/ew-editor-doc/utils/source.js');
    const url = await buildSourceUrl('/h6test/work~draft/page');
    expect(url).to.equal(`${DA_ORIGIN}/h6test/sites/work~draft/source/page.html`);
    const response = await checkDoc(url);
    expect(response.ok).to.equal(true);
    expect(response.headers.get('etag')).to.equal('"draft-item:1"');
    expect(response.permissions).to.include('write');
    window.fetch = async () => new Response(null, { headers: { 'content-branch': 'other', 'x-da-source-mode': 'helix6' } });
    expect((await checkDoc(url)).status).to.equal(422);
  });

  it('drops a delayed branch discovery after a path or binding change', async () => {
    let release;
    let started;
    const waiting = new Promise((resolve) => { started = resolve; });
    window.fetch = () => new Promise((resolve) => {
      release = resolve;
      started();
    });
    const pending = getNx2Api();
    await waiting;
    const changed = new URL(window.location.href);
    changed.searchParams.set('da-admin', 'stage');
    changed.hash = '#/h6test/work~draft/other';
    window.history.replaceState(null, '', changed);
    release(new Response('', { headers: { 'x-api-upgrade-available': 'true' } }));
    try {
      await pending;
      throw new Error('expected denial');
    } catch (error) {
      expect(error.message).to.include('context changed');
    }
  });

  it('discards branch metadata that was in flight during a branch deletion', async () => {
    let release;
    let started;
    const waiting = new Promise((resolve) => { started = resolve; });
    const fetcher = window.fetch;
    window.fetch = (target, options) => {
      if (target.endsWith('/branches/h6test/work/draft')) {
        return new Promise((resolve) => {
          release = resolve;
          started();
        });
      }
      return fetcher(target, options);
    };
    const pending = getNx2Api();
    await waiting;
    invalidateBranchingDiscovery();
    release(new Response(JSON.stringify({ id: 'draft', revision: 1 })));
    try {
      await pending;
      throw new Error('expected denial');
    } catch (error) {
      expect(error.message).to.include('context changed');
    }
    expect(calls.some(({ target }) => target.includes('/source/'))).to.equal(false);
  });
});
