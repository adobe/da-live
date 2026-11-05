import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import { DaLandingTiles } from '../../../../blocks/landing/tile-group.js';
import { parseTileEntries } from '../../../../blocks/landing/tile-content.js';
import { getNx, getNx2Api, getNxEWFlags } from '../../../../scripts/utils.js';

const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const { source } = await getNx2Api();
const { setEWEnabled } = await getNxEWFlags();
const content = await fetch('/test/fixtures/landing-tiles.html').then((response) => response.text());

describe('landing tile group', () => {
  let el;
  let loadSite;

  beforeEach(async () => {
    hashChange._set({ org: 'org', site: 'site', fullpath: '/org/site' });
    loadSite = sinon.stub(DaLandingTiles.prototype, 'loadSite').callsFake(async function loadSiteForTest() {
      this._request?.abort();
      this._request = new AbortController();
    });
    el = document.createElement('da-landing-tiles');
    el.entries = parseTileEntries(new DOMParser().parseFromString(content, 'text/html').querySelector('.landing'));
    document.body.append(el);
    el._editor = '/canvas#';
    await el.updateComplete;
  });

  afterEach(() => {
    el.remove();
    sinon.restore();
    setEWEnabled(false);
  });

  it('renders only the five tiles, without Content, cards or chat', async () => {
    const root = el.shadowRoot;
    expect(root.querySelector('#files-heading, .files-panel, da-file-item, .composer, textarea'))
      .to.equal(null);
    expect([...root.querySelector('.tile-group').children].map((node) => node.tagName))
      .to.deep.equal(['UL']);
    const tiles = [...root.querySelectorAll('da-landing-tile')];
    await Promise.all(tiles.map((tile) => tile.updateComplete));
    expect(tiles.map((tile) => tile.heading)).to.deep.equal([
      'Browse Content', 'Create a page', 'Publishing & Workflow',
      'Localization & Multi-site', 'Develop & Extend',
    ]);
    expect(tiles.slice(2, 4).map((tile) => tile.href)).to.deep.equal([
      'https://www.aem.live/docs/ew/authoring/publishing',
      'https://www.aem.live/docs/ew/administering/multi-site-manager',
    ]);
    expect(new URL(tiles[4].href).hash).to.equal('#org/site');
    expect(tiles[0].tone).to.equal('green');
  });

  it('uses authored order, text, tone and action instead of tile titles or positions', async () => {
    const create = sinon.stub(el, '_onCreatePage');
    el.entries = [
      { ...el.entries[1], heading: 'Write something', tone: 'purple', id: 'new-document' },
      { ...el.entries[0], heading: 'Open files', tone: 'orange' },
      { ...el.entries[2], href: '/{action:unknown}' },
    ];
    el._permissions = ['write'];
    await el.updateComplete;
    const tiles = [...el.shadowRoot.querySelectorAll('da-landing-tile')];
    await Promise.all(tiles.map((tile) => tile.updateComplete));
    expect(tiles.map((tile) => tile.heading)).to.deep.equal([
      'Write something', 'Open files', 'Publishing & Workflow',
    ]);
    expect(tiles[0].tone).to.equal('purple');
    expect(tiles[0].actionId).to.equal('new-document');
    expect(new URL(tiles[1].href).hash).to.equal('#/org/site');
    expect(tiles[2].shadowRoot.querySelector('button').disabled).to.equal(true);
    tiles[0].shadowRoot.querySelector('button').click();
    expect(create.calledOnce).to.equal(true);
  });

  it('routes Browse through the selected site while retaining preview settings', async () => {
    const { href } = window.location;
    try {
      window.history.replaceState(null, '', '/?nx=main&nxver=2&landing=true#/org/site');
      el.requestUpdate();
      await el.updateComplete;
      const tile = el.shadowRoot.querySelector('da-landing-tile');
      expect(tile.disabled).to.equal(false);
      expect(new URL(tile.href).searchParams.get('nx')).to.equal('main');
      expect(new URL(tile.href).searchParams.get('nxver')).to.equal('2');
      expect(new URL(tile.href).hash).to.equal('#/org/site');
      hashChange._set({ org: 'other', site: 'site', fullpath: '/other/site' });
      await el.updateComplete;
      expect(new URL(tile.href).hash).to.equal('#/other/site');
    } finally {
      window.history.replaceState(null, '', href);
    }
  });

  it('renders Browse and Create as disabled native buttons without a selected site', async () => {
    hashChange._set(undefined);
    await el.updateComplete;
    const [browse, create, , , develop] = el.shadowRoot.querySelectorAll('da-landing-tile');
    await Promise.all([browse.updateComplete, create.updateComplete, develop.updateComplete]);
    expect(browse.href).to.equal(undefined);
    expect(browse.disabled).to.equal(true);
    expect(create.disabled).to.equal(true);
    expect(browse.shadowRoot.querySelector('button').disabled).to.equal(true);
    expect(create.shadowRoot.querySelector('button').disabled).to.equal(true);
    expect(develop.shadowRoot.querySelector('button').disabled).to.equal(true);
    await el._onCreatePage();
    expect(el._createDialog).to.equal(undefined);
  });

  it('requires write permission for page creation and cancels without writing', async () => {
    const save = sinon.stub(source, 'save');
    await el._onCreatePage();
    expect(el._createDialog).to.equal(undefined);
    el._permissions = ['write'];
    await el._onCreatePage();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('da-name-dialog')).not.to.equal(null);
    el._onCloseCreatePage();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('da-name-dialog')).to.equal(null);
    expect(save.called).to.equal(false);
  });

  it('creates at the selected site root and refreshes permissions without navigating', async () => {
    const metadata = sinon.stub(source, 'getMetadata').resolves({ ok: false, status: 404 });
    const save = sinon.stub(source, 'save').resolves({ ok: true });
    el._permissions = ['write'];
    await el._onCreatePage();
    await el._onCreatePageSubmit({ detail: { name: 'draft', openAfter: false } });
    expect(metadata.calledOnceWithExactly('/org/site/draft.html')).to.equal(true);
    expect(save.calledOnce).to.equal(true);
    expect(save.firstCall.args[0]).to.equal('/org/site/draft.html');
    expect(el._createDialog).to.equal(undefined);
    expect(loadSite.callCount).to.equal(2);
  });

  it('does not overwrite a page and keeps failed saves retryable', async () => {
    const metadata = sinon.stub(source, 'getMetadata').resolves({ ok: true });
    const save = sinon.stub(source, 'save').resolves({ ok: false, status: 403 });
    el._permissions = ['write'];
    await el._onCreatePage();
    await el._onCreatePageSubmit({ detail: { name: 'draft', openAfter: false } });
    expect(save.called).to.equal(false);
    expect(el._createDialog.error).to.include('already exists');
    metadata.resolves({ ok: false, status: 404 });
    await el._onCreatePageSubmit({ detail: { name: 'draft', openAfter: false } });
    expect(el._createDialog.error).to.include('permissions');
    expect(el._createDialog.saving).to.equal(false);
  });

  it('ignores a pending name check after the selected site changes', async () => {
    let finish;
    sinon.stub(source, 'getMetadata').returns(new Promise((resolve) => { finish = resolve; }));
    const save = sinon.stub(source, 'save');
    el._permissions = ['write'];
    await el._onCreatePage();
    const pending = el._onCreatePageSubmit({ detail: { name: 'draft', openAfter: false } });
    hashChange._set({ org: 'other', site: 'site', fullpath: '/other/site' });
    finish({ ok: false, status: 404 });
    await pending;
    expect(save.called).to.equal(false);
    expect(el._createDialog).to.equal(undefined);
  });

  it('checks root permissions once without paginating or rendering file results', async () => {
    loadSite.restore();
    const list = sinon.stub(source, 'list').resolves({ ok: true, items: [{ path: '/org/site/page.html' }], permissions: ['write'], continuationToken: 'next' });
    await el.loadSite();
    await el.updateComplete;
    expect(list.calledOnce).to.equal(true);
    expect(list.firstCall.args[0]).to.equal('/org/site');
    expect(list.firstCall.args[1].opts.signal).to.equal(el._request.signal);
    expect(el._editor).to.equal('/edit#');
    expect(el.shadowRoot.querySelectorAll('da-landing-tile')[1].disabled).to.equal(false);
    expect(el.shadowRoot.querySelector('da-file-item, .files-panel')).to.equal(null);
  });

  it('does not allow creation when permission checks fail', async () => {
    loadSite.restore();
    sinon.stub(source, 'list').resolves({ ok: false, status: 403 });
    await el.loadSite();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.include('permissions');
    expect(el.shadowRoot.querySelectorAll('da-landing-tile')[1].disabled).to.equal(true);
  });

  it('ignores a stale permission response and aborts on disconnect', async () => {
    loadSite.restore();
    let finish;
    const list = sinon.stub(source, 'list');
    list.onFirstCall().returns(new Promise((resolve) => { finish = resolve; }));
    list.onSecondCall().resolves({ ok: true, permissions: ['read'] });
    const pending = el.loadSite();
    await Promise.resolve();
    el._scope = 'other/site';
    await el.loadSite();
    finish({ ok: true, permissions: ['write'] });
    await pending;
    expect(el._permissions).to.deep.equal(['read']);
    const request = el._request;
    el.remove();
    expect(request.signal.aborted).to.equal(true);
  });

  it('selects Canvas when EW is enabled', async () => {
    loadSite.restore();
    sinon.stub(source, 'list').resolves({ ok: true, permissions: ['write'] });
    setEWEnabled(true);
    await el.loadSite();
    expect(el._editor).to.equal('/canvas#');
  });

  it('falls back to the classic editor when the EW flag fails', async () => {
    loadSite.restore();
    sinon.stub(source, 'list').resolves({ ok: true, permissions: ['write'] });
    setEWEnabled(Promise.reject(new Error('Flag unavailable')));
    await el.loadSite();
    expect(el._editor).to.equal('/edit#');
  });
});
