import { expect } from '@esm-bundle/chai';
import { setNx, getNx2Api, getNxEWFlags } from '../../../../scripts/utils.js';
import { DA_ORIGIN, COLLAB_ORIGIN, isAllowedDaAdminOrigin, getDaAdminEnvironment, getDaCollabEnvironment } from '../../../../blocks/shared/constants.js';
import { discoverDaRs, invalidateDaRsDiscovery, provisionDaRsSite } from '../../../../blocks/shared/da-rs-provider.js';
import { daFetch, saveToDa } from '../../../../blocks/shared/utils.js';
import { withDaRsBinding } from '../../../../blocks/shared/da-rs-navigation.js';
import getEditPath from '../../../../blocks/shared/da-file-item/edit-path.js';
import { evaluatePage } from '../../../../blocks/canvas/ew-preflight/api.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const OPAQUE_VERSION_ID = '8e0b176b-9230-4bdb-93e1-dbd92406a83d.html';
let buildSourceUrl;
let checkDoc;
before(async () => {
  ({ buildSourceUrl, checkDoc } = await import('../../../../blocks/canvas/ew-editor-doc/utils/source.js'));
});

describe('explicit da-rs binding', () => {
  let url;
  let fetch;
  let calls;
  beforeEach(() => {
    url = window.location.href;
    fetch = window.fetch;
    calls = [];
    const selected = new URL(url);
    selected.searchParams.set('da-source', 'da-rs');
    selected.hash = '#/demo/work/page';
    window.history.replaceState(null, '', selected);
    invalidateDaRsDiscovery();
    localStorage.setItem('hlx6-upgrade', JSON.stringify({ 'demo/work': true }));
  });
  afterEach(() => {
    window.fetch = fetch;
    window.history.replaceState(null, '', url);
    localStorage.removeItem('hlx6-upgrade');
    invalidateDaRsDiscovery();
  });

  it('deduplicates local discovery and uses the same origin for both modes', async () => {
    window.fetch = async (target, options) => {
      calls.push({ target, options });
      return new Response('', { headers: target.endsWith('/work') ? { 'x-api-upgrade-available': 'true' } : {} });
    };
    const [one, two] = await Promise.all([discoverDaRs('demo', 'work'), discoverDaRs('demo', 'work')]);
    expect(one).to.equal(two);
    expect(one.mode).to.equal('helix6');
    expect(calls).to.have.length(1);
    expect(await buildSourceUrl('/demo/work/page')).to.equal(`${DA_ORIGIN}/demo/sites/work/source/page.html`);
    window.history.replaceState(null, '', '#/demo/legacy/page');
    expect(await buildSourceUrl('/demo/legacy/page')).to.equal(`${DA_ORIGIN}/source/demo/legacy/page.html`);
    expect(calls.map(({ target }) => target)).to.deep.equal([`${DA_ORIGIN}/ping/demo/work`, `${DA_ORIGIN}/ping/demo/legacy`]);
    expect(calls.every(({ options }) => options.redirect === 'error')).to.equal(true);
  });

  it('fails closed on discovery errors and retries without using the global cache', async () => {
    window.fetch = async () => new Response('', { status: 503 });
    let failed = false;
    try { await discoverDaRs('demo', 'work'); } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
    window.fetch = async () => new Response('');
    expect((await discoverDaRs('demo', 'work')).mode).to.equal('legacy');
  });

  it('rejects malformed upgrade headers instead of selecting legacy', async () => {
    window.fetch = async () => new Response('', { headers: { 'x-api-upgrade-available': 'false' } });
    let failed = false;
    try { await discoverDaRs('demo', 'work'); } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
  });

  it('rejects noncanonical bare scopes before any discovery request', async () => {
    window.fetch = async (...args) => {
      calls.push(args);
      return new Response('');
    };
    for (const [org, site] of [['Demo', 'work'], ['demo', 'work.site'], ['demo', 'Work']]) {
      let failed = false;
      try { await discoverDaRs(org, site); } catch {
        failed = true;
      }
      expect(failed).to.equal(true);
    }
    expect(calls).to.have.length(0);
    expect((await discoverDaRs('_demo', '-work')).mode).to.equal('legacy');
  });

  it('provisions explicitly with an empty body and refreshes discovery', async () => {
    let upgraded = false;
    window.fetch = async (target, options) => {
      calls.push({ target, options });
      if (options.method === 'POST') {
        upgraded = true;
        return new Response('', { status: 201 });
      }
      return new Response('', { headers: upgraded ? { 'x-api-upgrade-available': 'true' } : {} });
    };
    expect((await discoverDaRs('demo', 'work')).mode).to.equal('legacy');
    expect((await provisionDaRsSite('demo', 'work')).status).to.equal(201);
    expect(calls[1].target).to.equal(`${DA_ORIGIN}/demo/sites/work/source/`);
    expect(calls[1].options.body).to.equal(undefined);
    expect((await discoverDaRs('demo', 'work')).mode).to.equal('helix6');
  });

  it('never sends a token to any other DA, ETC, or arbitrary origin', async () => {
    window.fetch = async (...args) => {
      calls.push(args);
      return new Response('');
    };
    for (const origin of ['https://content.da.live', 'https://admin.hlx.page', 'https://example.test']) {
      let failed = false;
      try { await daFetch(`${origin}/source/demo/work/page.html`); } catch {
        failed = true;
      }
      expect(failed).to.equal(true);
    }
    expect(calls).to.have.length(0);
  });

  it('refuses direct Preflight and remote asset entry points', async () => {
    window.fetch = async (...args) => {
      calls.push(args);
      return new Response('');
    };
    let failed = false;
    try { await evaluatePage('https://outside.test/page'); } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
    const { renderAssets, getRepositoryConfig } = await import('../../../../blocks/canvas/ew-panel-extensions/aem-assets.js');
    const { renderAssetsRail } = await import('../../../../blocks/canvas/ew-canvas-assets/ew-canvas-assets.js');
    expect(await renderAssets({ container: document.createElement('div'), org: 'demo', site: 'work' }))
      .to.equal(undefined);
    expect(await getRepositoryConfig('demo', 'work')).to.equal(null);
    expect((await renderAssetsRail({ container: document.createElement('div'), org: 'demo', site: 'work' })).error)
      .to.equal('AEM Assets is not configured for this site.');
    const { COMMAND_BY_ID } = await import('../../../../blocks/canvas/editor-utils/command-defs.js');
    expect(COMMAND_BY_ID.get('image-focal-point').visible({})).to.equal(false);
    expect(calls).to.have.length(0);
  });

  it('sends the live token only to the selected origin and forbids redirects', async () => {
    const ims = window.adobeIMS;
    const saved = localStorage.getItem('nx-ims');
    localStorage.setItem('nx-ims', 'true');
    window.adobeIMS = { getAccessToken: () => ({ token: 'bound-token' }) };
    window.fetch = async (target, options) => {
      calls.push({ target, options });
      return new Response('');
    };
    try {
      await daFetch(`${DA_ORIGIN}/source/demo/work/page.html`);
      expect(calls[0].options.headers.Authorization).to.equal('Bearer bound-token');
      expect(calls[0].options.redirect).to.equal('error');
      expect(calls[0].options.headers['x-content-source-authorization']).to.equal(undefined);
    } finally {
      window.adobeIMS = ims;
      if (saved === null) localStorage.removeItem('nx-ims');
      else localStorage.setItem('nx-ims', saved);
    }
  });

  it('only accepts configured admin environment origins', () => {
    expect(isAllowedDaAdminOrigin(undefined)).to.equal(false);
    expect(isAllowedDaAdminOrigin('https://admin.da.live.evil.test')).to.equal(false);
    expect(isAllowedDaAdminOrigin('http://localhost:8787')).to.equal(true);
  });

  it('reads the Workspace flag independently from local site config', async () => {
    window.fetch = async (target) => {
      calls.push(target);
      const value = target.endsWith('/work/') ? 'true' : 'false';
      return new Response(JSON.stringify({ data: [{ key: 'ew.enabled', value }] }));
    };
    const flags = await getNxEWFlags();
    expect(await flags.isEWEnabled({ org: 'demo', site: 'work' })).to.equal(true);
    expect(calls).to.have.members([`${DA_ORIGIN}/config/demo/`, `${DA_ORIGIN}/config/demo/work/`]);
  });

  it('retains the selection on first-party route transitions but not external links', () => {
    const admin = getDaAdminEnvironment(DA_ORIGIN);
    const collab = getDaCollabEnvironment(COLLAB_ORIGIN);
    const envQuery = `da-source=da-rs&da-admin=${admin}&da-collab=${collab}`;
    expect(getEditPath({ path: '/demo/work/page.html', ext: 'html', editor: '/canvas#' }))
      .to.equal(`/canvas?${envQuery}#/demo/work/page`);
    expect(getEditPath({ path: '/demo/work/image.png', ext: 'png' }))
      .to.equal(`/media?${envQuery}#/demo/work/image.png`);
    const current = `${window.location.origin}/canvas?da-source=da-rs&da-admin=local&da-collab=local#/demo/work/page`;
    expect(withDaRsBinding('/#/demo/work', current))
      .to.equal('/?da-source=da-rs&da-admin=local&da-collab=local#/demo/work');
    expect(withDaRsBinding('https://outside.test/canvas#/demo/work', current))
      .to.equal('https://outside.test/canvas#/demo/work');
    expect(withDaRsBinding('/canvas#/demo/work~branch/page', current))
      .to.equal('/canvas?da-source=da-rs&da-admin=local&da-collab=local#/demo/work~branch/page');
    expect(withDaRsBinding('#/demo/work/folder', current)).to.equal('#/demo/work/folder');
    expect(withDaRsBinding('/canvas?da-admin=prod&da-collab=prod#/demo/work/page', current))
      .to.equal('/canvas?da-source=da-rs&da-admin=local&da-collab=local#/demo/work/page');
    expect(withDaRsBinding('/canvas?da-admin=prod#/demo/work/page', window.location.href))
      .to.equal(`/canvas?${envQuery}#/demo/work/page`);
  });

  it('drops a discovery result after navigation', async () => {
    let resolve;
    let started;
    const requestStarted = new Promise((done) => { started = done; });
    window.fetch = () => new Promise((done) => {
      resolve = done;
      started();
    });
    const pending = buildSourceUrl('/demo/work/page');
    await requestStarted;
    window.location.hash = '#/demo/other/page';
    resolve(new Response('', { headers: { 'x-api-upgrade-available': 'true' } }));
    let failed = false;
    try { await pending; } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
  });

  it('drops discovery when the provider configuration changes without a hash change', async () => {
    let resolve;
    let started;
    const requestStarted = new Promise((done) => { started = done; });
    window.fetch = () => new Promise((done) => {
      resolve = done;
      started();
    });
    const pending = buildSourceUrl('/demo/work/page');
    await requestStarted;
    const targetUrl = new URL(window.location.href);
    targetUrl.searchParams.set('da-admin', 'stage');
    window.history.replaceState(null, '', targetUrl);
    resolve(new Response('', { headers: { 'x-api-upgrade-available': 'true' } }));
    let failed = false;
    try { await pending; } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
  });

  it('uses the action header for HEAD and never infers write', async () => {
    window.fetch = async () => new Response('', { headers: { 'x-da-actions': '/work/page.html=read', 'x-da-child-actions': '/work/page.html=read,write' } });
    expect((await checkDoc(`${DA_ORIGIN}/demo/sites/work/source/page.html`)).permissions).to.deep.equal(['read']);
    window.fetch = async () => new Response('');
    expect((await checkDoc(`${DA_ORIGIN}/demo/sites/work/source/page.html`)).permissions).to.deep.equal(['read']);
  });

  it('saves a raw H6 document and does not fall back on failure', async () => {
    window.fetch = async (target, options) => {
      calls.push({ target, options });
      if (target.includes('/ping/')) return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      return new Response('', { status: 403 });
    };
    const { source } = await getNx2Api();
    const response = await source.save('/demo/work/page.html', { body: '<body></body>' });
    expect(response.status).to.equal(403);
    expect(calls.map(({ target }) => target)).to.deep.equal([
      `${DA_ORIGIN}/ping/demo/work`, `${DA_ORIGIN}/demo/sites/work/source/page.html`,
    ]);
    expect(calls[1].options.method).to.equal('POST');
    expect(calls[1].options.body).to.equal('<body></body>');
    expect(calls[1].options.headers['Content-Type']).to.equal('text/html');
  });

  it('uses the legacy routes at the same origin when discovery has no upgrade header', async () => {
    window.fetch = async (target, options) => {
      calls.push({ target, options });
      return new Response('');
    };
    const { source } = await getNx2Api();
    await source.save('/demo/work/page.html', { body: '<body></body>' });
    expect(calls[1].target).to.equal(`${DA_ORIGIN}/source/demo/work/page.html`);
    expect(calls[1].options.body).to.be.instanceOf(FormData);
  });

  it('updates existing H6 documents with raw PUT, without a POST fallback', async () => {
    window.fetch = async (target, options) => {
      calls.push({ target, options });
      if (target.includes('/ping/')) return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      return new Response('', { status: 201 });
    };
    const { source } = await getNx2Api();
    await source.replace('/demo/work/data.json', { body: '{"data":[]}', ifMatch: '"r1"' });
    expect(calls[1].target).to.equal(`${DA_ORIGIN}/demo/sites/work/source/data.json`);
    expect(calls[1].options.method).to.equal('PUT');
    expect(calls[1].options.headers['Content-Type']).to.equal('application/json');
    expect(calls[1].options.headers['If-Match']).to.equal('"r1"');
    expect(calls[1].options.body).to.equal('{"data":[]}');
  });

  it('routes shared and form updates through H6 PUT', async () => {
    window.fetch = async (target, options) => {
      calls.push({ target, options });
      if (target.includes('/ping/')) return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      return new Response('', { status: 201 });
    };
    const { saveSourceHtml } = await import('../../../../blocks/form/utils/da-api.js');
    expect(await saveSourceHtml({ path: '/demo/work/page.html', html: '<main>form</main>' }))
      .to.deep.equal({ ok: true });
    await saveToDa({ path: '/demo/work/page.html', blob: new Blob(['updated'], { type: 'text/html' }) });
    const { saveToDa: saveSheet } = await import('../../../../blocks/edit/utils/helpers.js');
    const sheet = { name: 'data', getData: () => [['key'], ['value']], getConfig: () => ({ columns: [{}] }) };
    await saveSheet('/demo/work/data', [sheet]);
    expect(calls.slice(1).map(({ options }) => options.method)).to.deep.equal(['PUT', 'PUT', 'PUT']);
    expect(calls.slice(1, 3).every(({ target }) => target === `${DA_ORIGIN}/demo/sites/work/source/page.html`))
      .to.equal(true);
    expect(calls[3].target).to.equal(`${DA_ORIGIN}/demo/sites/work/source/data.json`);
  });

  it('does not retry a rejected H6 replacement on a different route', async () => {
    window.fetch = async (target, options) => {
      calls.push({ target, options });
      if (target.includes('/ping/')) return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      return new Response('', { status: 412 });
    };
    const { source } = await getNx2Api();
    expect((await source.replace('/demo/work/page.html', { body: 'old', ifMatch: '"r1"' })).status).to.equal(412);
    expect(calls).to.have.length(2);
    let failed = false;
    try { await saveToDa({ path: '/demo/work/page.html', blob: new Blob(['old']) }); } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
    expect(calls).to.have.length(3);
  });

  it('keeps bound legacy updates on the legacy multipart route', async () => {
    window.fetch = async (target, options) => {
      calls.push({ target, options });
      return new Response('');
    };
    const { source } = await getNx2Api();
    await source.replace('/demo/work/page.html', { body: 'updated' });
    expect(calls[1].target).to.equal(`${DA_ORIGIN}/source/demo/work/page.html`);
    expect(calls[1].options.method).to.equal('POST');
    expect(calls[1].options.body).to.be.instanceOf(FormData);
  });

  it('normalizes H6 folder listings and does not allow cross-site copies', async () => {
    window.fetch = async (target, options) => {
      calls.push({ target, options });
      if (target.includes('/ping/')) return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      return new Response(JSON.stringify([
        { name: 'assets/', 'content-type': 'application/folder' },
        { name: 'page.html', 'content-type': 'text/html', 'last-modified': '2026-01-02T03:04:05Z' },
      ]));
    };
    const { source } = await getNx2Api();
    const listing = await source.list('/demo/work');
    expect(calls[1].target).to.equal(`${DA_ORIGIN}/demo/sites/work/source/`);
    expect(listing.items[0]).to.deep.equal({ name: 'assets', path: '/demo/work/assets', contentType: 'application/folder' });
    expect(listing.items[1].ext).to.equal('html');
    let failed = false;
    try { await source.copy('/demo/work/page.html', { destination: '/demo/other/copy.html' }); } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
    expect(calls).to.have.length(2);
  });

  it('uploads raw local image bytes and returns a portable relative reference', async () => {
    window.fetch = async (target, options) => {
      calls.push({ target, options });
      if (target.includes('/ping/')) return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      return new Response('', { status: 201 });
    };
    const { source } = await getNx2Api();
    const image = new File(['image'], 'photo.png', { type: 'image/png' });
    const response = await source.uploadMedia('/demo/work/.page/photo.png', { body: image });
    const { source: result } = await response.json();
    expect(result.contentUrl).to.match(/^\.\/media_[a-f0-9]+\.png$/);
    expect(calls[1].target).to.equal(`${DA_ORIGIN}/demo/sites/work/source/${result.contentUrl.slice(2)}`);
    expect(calls[1].options.body).to.equal(image);
    expect(calls[1].options.headers['Content-Type']).to.equal('image/png');
    expect(calls[1].options.headers['If-None-Match']).to.equal(undefined);
  });

  it('uses bound version and activity routes with the frozen query shape', async () => {
    window.fetch = async (target, options) => {
      calls.push({ target, options });
      if (target.includes('/ping/')) return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      return new Response('');
    };
    const { versions } = await getNx2Api();
    await versions.list('/demo/work/page.html');
    await versions.history('/demo/work/page.html');
    await versions.get('/demo/work/page.html', { versionId: OPAQUE_VERSION_ID });
    await versions.create('/demo/work/page.html', { operation: 'version', comment: 'first', ifMatch: '"r1"' });
    expect(calls.map(({ target }) => target)).to.deep.equal([
      `${DA_ORIGIN}/ping/demo/work`,
      `${DA_ORIGIN}/demo/sites/work/source/page.html/.versions`,
      `${DA_ORIGIN}/demo/sites/work/source/page.html/.history`,
      `${DA_ORIGIN}/demo/sites/work/source/page.html/.versions/${OPAQUE_VERSION_ID}`,
      `${DA_ORIGIN}/demo/sites/work/source/page.html/.versions?operation=version&comment=first`,
    ]);
    expect(calls[4].options.headers['If-Match']).to.equal('"r1"');
    let failed = false;
    try { await versions.create('/demo/work/page.html', { ifMatch: '*' }); } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
    expect(calls).to.have.length(5);
  });

  it('accepts safe opaque H6 version IDs and rejects ambiguous or overlong IDs', async () => {
    window.fetch = async (target, options) => {
      calls.push({ target, options });
      if (target.includes('/ping/')) return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      return new Response('');
    };
    const { versions } = await getNx2Api();
    const invalid = [
      '', '.', '..', 'a/b', 'a\\b', 'a%2fb', 'a%252fb', 'a%2ehtml',
      'a?b', 'a#b', 'a\n', 'é', 'a'.repeat(129), 123, null,
    ];
    for (const versionId of invalid) {
      let failed = false;
      try { await versions.get('/demo/work/page.html', { versionId }); } catch {
        failed = true;
      }
      expect(failed, `expected invalid version ${JSON.stringify(versionId)}`).to.equal(true);
    }
    expect(calls.map(({ target }) => target)).to.deep.equal([`${DA_ORIGIN}/ping/demo/work`]);
    for (const versionId of ['2-0.html', 'a..b', '...', 'a'.repeat(128)]) {
      const response = await versions.get('/demo/work/page.html', { versionId });
      expect(response.ok).to.equal(true);
      expect(calls.at(-1).target)
        .to.equal(`${DA_ORIGIN}/demo/sites/work/source/page.html/.versions/${versionId}`);
    }
  });

  it('loads and restores a version using the opaque ID returned by H6 History', async () => {
    window.fetch = async (target, options) => {
      calls.push({ target, options });
      if (target.endsWith('/ping/demo/work')) {
        return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      }
      if (target.endsWith('/.versions')) {
        return new Response(JSON.stringify([{
          version: OPAQUE_VERSION_ID,
          'doc-last-modified': '2026-01-02T03:04:05Z',
          'doc-path-hint': '/page.html',
          'doc-last-modified-by': 'author@example.test',
          'version-date': '2026-01-02T03:04:06Z',
          'version-by': 'editor@example.test',
          'version-operation': 'version',
          'version-comment': 'first',
        }]));
      }
      if (target.endsWith('/.history')) {
        return new Response(JSON.stringify({ entries: [], truncated: false }));
      }
      if (target.endsWith(`/.versions/${OPAQUE_VERSION_ID}`)) {
        return new Response('<body><header></header><main><div><p>Restored content</p></div></main><footer></footer></body>', { headers: { 'Content-Type': 'text/html' } });
      }
      throw new Error(`Unexpected request: ${target}`);
    };
    const { fetchVersions, fetchDaRsVersionDocument } = await import('../../../../blocks/shared/version/version-actions.js');
    const [entry] = await fetchVersions('/demo/work/page.html');
    expect(entry.versionId).to.equal(OPAQUE_VERSION_ID);
    const restored = await fetchDaRsVersionDocument('/demo/work/page.html', entry);
    expect(restored.textContent).to.contain('Restored content');
    expect(calls.at(-1).target)
      .to.equal(`${DA_ORIGIN}/demo/sites/work/source/page.html/.versions/${OPAQUE_VERSION_ID}`);
  });

  it('keeps legacy multi-segment version IDs unchanged', async () => {
    window.fetch = async (target, options) => {
      calls.push({ target, options });
      return new Response('');
    };
    const { versions } = await getNx2Api();
    await versions.get('/demo/work/page.html', { versionId: 'document-id/2-0.html' });
    expect(calls.at(-1).target).to.equal(`${DA_ORIGIN}/versionsource/demo/work/document-id/2-0.html`);
  });

  it('rejects a stale captured adapter before sending a request', async () => {
    const { source } = await getNx2Api();
    window.history.replaceState(null, '', '#/demo/other/page');
    window.fetch = async (...args) => {
      calls.push(args);
      return new Response('');
    };
    let failed = false;
    try { await source.get('/demo/work/page.html'); } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
    expect(calls).to.have.length(0);
  });
});
