/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
await import('../../../../../blocks/canvas/ew-canvas-versions/ew-canvas-versions.js');
const { installComparison } = await import('../../../../../blocks/canvas/ew-comparison/comparison.js');
const { fetchVersionHtml } = await import('../../../../../blocks/shared/version/version-actions.js');

describe('bound comparison guard', () => {
  let originalUrl;
  let originalFetch;
  let calls;
  beforeEach(() => {
    originalUrl = window.location.href;
    originalFetch = window.fetch;
    const url = new URL(originalUrl);
    url.searchParams.set('da-source', 'da-rs');
    url.hash = '#/demo/work/page';
    window.history.replaceState(null, '', url);
    calls = [];
    window.fetch = async (...args) => {
      calls.push(args);
      return new Response('');
    };
  });
  afterEach(() => {
    window.fetch = originalFetch;
    window.history.replaceState(null, '', originalUrl);
  });

  it('does not fetch or mount History preview and comparison', async () => {
    const el = document.createElement('ew-canvas-versions');
    el.path = '/demo/work/page.html';
    await el._openCompare({ versionId: 'v1' });
    await el.handleCompare({ stopPropagation() {} }, { versionId: 'v1' });
    expect(await el._buildDiff(document.createElement('div'))).to.equal(null);
    expect(el._compareCtx).not.to.exist;
    expect(await fetchVersionHtml(el.path, { versionId: 'v1' })).to.equal(null);
    expect(calls).to.have.length(0);
  });

  it('does not clone preview DOM supplied directly to the comparison component', () => {
    const el = document.createElement('ew-canvas-compare');
    const unsafe = { cloneNode: () => { throw new Error('must not clone'); } };
    expect(el._displayDom(unsafe).children).to.have.length(0);
    expect(calls).to.have.length(0);
  });

  it('rejects delivered-content comparison before opening the surface', async () => {
    const mountRoot = document.createElement('div');
    const comparison = installComparison({ mountRoot, getContext: () => ({ org: 'demo', site: 'work', path: 'page' }) });
    try {
      expect(await comparison.open({ candidate: 'document', baseline: 'live' }))
        .to.deep.equal({ ok: false, error: 'comparison-unavailable' });
      expect(mountRoot.children).to.have.length(0);
      expect(calls).to.have.length(0);
    } finally {
      comparison.destroy();
    }
  });

  it('discards an old History response when the binding changes', async () => {
    let finish;
    let started;
    const requestStarted = new Promise((resolve) => { started = resolve; });
    window.fetch = async (target) => {
      if (target.includes('/ping/')) return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      return new Promise((resolve) => {
        finish = resolve;
        started();
      });
    };
    const el = document.createElement('ew-canvas-versions');
    Object.defineProperty(el, 'isConnected', { value: true });
    el.path = '/demo/work/page.html';
    const pending = el._load();
    await requestStarted;
    const changed = new URL(window.location.href);
    changed.searchParams.set('da-admin', 'stage');
    window.history.replaceState(null, '', changed);
    finish(new Response(JSON.stringify([{ version: 'v1', 'version-date': '2026-01-02T03:04:06Z' }])));
    await pending;
    expect(el._versions).to.equal(undefined);
    expect(el._refreshing).to.equal(false);
    expect(el._loadError).to.equal(false);
  });
});
