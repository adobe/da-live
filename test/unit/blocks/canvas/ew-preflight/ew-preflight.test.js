/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx, getNx } from '../../../../../scripts/utils.js';

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const waitForRun = () => new Promise((resolve) => { setTimeout(resolve, 50); });

describe('EwPreflight', () => {
  let EwPreflight;
  let hashChange;
  let canvasBus;
  let savedFetch;
  let el;

  before(async () => {
    savedFetch = window.fetch;
    window.fetch = async () => new Response('', { status: 200 });
    setNx('/test/fixtures/nx', { hostname: 'example.com' });

    // Import via the same templated specifier ew-preflight.js uses (getNx()-based), so this
    // resolves to the identical cached module instance rather than a second copy.
    ({ hashChange } = await import(`${getNx()}/utils/utils.js`));
    ({ canvasBus } = await import('../../../../../blocks/canvas/utils/canvas-bus.js'));
    await import('../../../../../blocks/canvas/ew-preflight/ew-preflight.js');
    EwPreflight = customElements.get('ew-preflight');
  });

  after(() => {
    window.fetch = savedFetch;
  });

  afterEach(() => {
    if (el && el.parentElement) el.remove();
    el = null;
    hashChange._set({});
  });

  it('is defined as a custom element', () => {
    expect(EwPreflight).to.exist;
  });

  it('shows "no page" error when no page is open', async () => {
    el = document.createElement('ew-preflight');
    document.body.append(el);
    await nextFrame();

    expect(el._error).to.equal('No page is open.');
  });

  it('runs providers and adapts results into nx-page-eval once a page is open', async () => {
    hashChange._set({ org: 'org', site: 'site', path: '/page' });
    el = document.createElement('ew-preflight');
    document.body.append(el);
    await waitForRun();
    await nextFrame();

    expect(el._data).to.exist;
    expect(el._data.title).to.equal('Preflight');
    const renderer = el.shadowRoot.querySelector('nx-page-eval');
    expect(renderer).to.exist;
    expect(renderer.data).to.equal(el._data);
  });

  it('exposes a header refresh button that reruns on click', async () => {
    hashChange._set({ org: 'org', site: 'site', path: '/page' });
    el = document.createElement('ew-preflight');
    document.body.append(el);
    await waitForRun();
    await nextFrame();

    const btn = el.getHeaderActions();
    expect(btn).to.be.instanceOf(HTMLButtonElement);

    const firstData = el._data;
    btn.click();
    await waitForRun();
    expect(el._data).to.exist;
    expect(el._data).to.not.equal(firstData);
  });

  it('reports status via the preflight bridge when a matching run request arrives', async () => {
    hashChange._set({ org: 'org', site: 'site', path: '/page' });
    el = document.createElement('ew-preflight');
    document.body.append(el);
    await waitForRun();
    await nextFrame();

    let detail;
    const onStatus = (e) => { detail = e.detail; };
    document.addEventListener('nx-preflight-status', onStatus);
    canvasBus.preflightRunRequest.emit({ paths: ['/org/site/page.html'], requestId: 'req-1' });
    await waitForRun();
    document.removeEventListener('nx-preflight-status', onStatus);

    expect(detail?.requestId).to.equal('req-1');
    expect(detail?.path).to.equal('/org/site/page.html');
    expect(['success', 'fail']).to.include(detail?.status);
  });

  it('ignores a run request for a different path', async () => {
    hashChange._set({ org: 'org', site: 'site', path: '/page' });
    el = document.createElement('ew-preflight');
    document.body.append(el);
    await waitForRun();
    await nextFrame();

    let fired = false;
    const onStatus = () => { fired = true; };
    document.addEventListener('nx-preflight-status', onStatus);
    canvasBus.preflightRunRequest.emit({ paths: ['/other/site/page.html'], requestId: 'req-2' });
    await waitForRun();
    document.removeEventListener('nx-preflight-status', onStatus);

    expect(fired).to.be.false;
  });
});
