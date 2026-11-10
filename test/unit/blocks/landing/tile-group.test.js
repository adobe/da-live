import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import '../../../../blocks/landing/tile-group.js';
import { parseTileEntries } from '../../../../blocks/landing/tile-content.js';
import { getNx, getNx2Api, getNxEWFlags } from '../../../../scripts/utils.js';

const { source, config } = await getNx2Api();
const { isEWEnabled } = await getNxEWFlags();
const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const content = await fetch('/test/fixtures/landing-tiles.html').then((response) => response.text());

describe('landing tile group', () => {
  let el;

  const getTiles = async () => {
    const tiles = [...el.shadowRoot.querySelectorAll('da-landing-tile')];
    await Promise.all(tiles.map((tile) => tile.updateComplete));
    return tiles;
  };

  beforeEach(async () => {
    sinon.stub(config, 'get').resolves({ ok: false, status: 404 });
    hashChange._set({ org: 'org', site: 'site', fullpath: '/org/site' });
    el = document.createElement('da-landing-tiles');
    el.entries = parseTileEntries(new DOMParser().parseFromString(content, 'text/html').querySelector('.landing'));
    document.body.append(el);
    await el.updateComplete;
  });

  afterEach(() => {
    el.remove();
    sinon.restore();
    isEWEnabled.reset();
    isEWEnabled.resolves(false);
  });

  it('uses authored order, text and tone instead of tile titles or positions', async () => {
    el.entries = [
      { ...el.entries[1], heading: 'Write something', tone: 'purple' },
      { ...el.entries[0], heading: 'Open files', tone: 'orange' },
    ];
    await el.updateComplete;
    const tiles = await getTiles();
    expect(tiles.map((tile) => tile.heading)).to.deep.equal(['Write something', 'Open files']);
    expect(tiles[0].tone).to.equal('purple');
    expect(new URL(tiles[1].href).hash).to.equal('#/org/site');
  });

  it('updates Browse when the selected site changes', async () => {
    const [browse] = await getTiles();
    expect(new URL(browse.href).hash).to.equal('#/org/site');
    hashChange._set({ org: 'other', site: 'site', fullpath: '/other/site' });
    await el.updateComplete;
    expect(new URL(browse.href).hash).to.equal('#/other/site');
  });

  it('opens the shared name dialog from Create a page', async () => {
    const [, create] = await getTiles();
    expect(create.href).to.equal(undefined);
    create.shadowRoot.querySelector('button').click();
    await customElements.whenDefined('da-name-dialog');
    await el.updateComplete;
    const dialog = el.shadowRoot.querySelector('da-name-dialog');
    expect(dialog.getAttribute('dialog-title')).to.equal('New page in site');
    hashChange._set({ org: 'other', site: 'site', fullpath: '/other/site' });
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('da-name-dialog')).to.equal(null);
  });

  it('does not overwrite an existing page and shows save errors', async () => {
    const metadata = sinon.stub(source, 'getMetadata').resolves({ status: 200 });
    const save = sinon.stub(source, 'save').resolves({ ok: false, status: 403 });
    el._createDialog = { scope: 'org/site' };
    await el._onCreatePageSubmit({ detail: { name: 'draft' } });
    expect(metadata.calledOnceWithExactly('/org/site/draft.html')).to.equal(true);
    expect(save.called).to.equal(false);
    expect(el._createDialog.error).to.include('already exists');
    metadata.resolves({ status: 404 });
    await el._onCreatePageSubmit({ detail: { name: 'draft' } });
    expect(save.firstCall.args[0]).to.equal('/org/site/draft.html');
    expect(el._createDialog).to.deep.equal({ scope: 'org/site', saving: false, error: 'Could not create the page.' });
  });

  it('ignores a second submit while the first page is saving', async () => {
    sinon.stub(source, 'getMetadata').resolves({ status: 404 });
    let finish;
    const saved = new Promise((resolve) => { finish = resolve; });
    let started;
    const saving = new Promise((resolve) => { started = resolve; });
    const save = sinon.stub(source, 'save').callsFake(() => {
      started();
      return saved;
    });
    const navigate = sinon.stub(el, 'navigate');
    await el._onCreatePage();
    const pending = el._onCreatePageSubmit({ detail: { name: 'draft' } });
    await saving;
    await el._onCreatePageSubmit({ detail: { name: 'another' } });
    finish({ ok: true });
    await pending;
    expect(save.calledOnce).to.equal(true);
    expect(save.firstCall.args[0]).to.equal('/org/site/draft.html');
    expect(navigate.calledOnce).to.equal(true);
  });

  [false, true].forEach((ok) => {
    it(`ignores an old ${ok ? 'successful' : 'failed'} save after reopening Create for the same site`, async () => {
      sinon.stub(source, 'getMetadata').resolves({ status: 404 });
      let finish;
      const saved = new Promise((resolve) => { finish = resolve; });
      let started;
      const saving = new Promise((resolve) => { started = resolve; });
      sinon.stub(source, 'save').callsFake(() => {
        started();
        return saved;
      });
      const navigate = sinon.stub(el, 'navigate');
      await el._onCreatePage();
      const pending = el._onCreatePageSubmit({ detail: { name: 'draft' } });
      await saving;
      el._onCloseCreatePage();
      await el._onCreatePage();
      const reopened = el._createDialog;
      finish({ ok });
      await pending;
      expect(el._createDialog).to.equal(reopened);
      expect(navigate.called).to.equal(false);
    });
  });

  it('does not save after closing Create while checking the name', async () => {
    let finish;
    sinon.stub(source, 'getMetadata').returns(new Promise((resolve) => { finish = resolve; }));
    const save = sinon.stub(source, 'save').resolves({ ok: true });
    await el._onCreatePage();
    const pending = el._onCreatePageSubmit({ detail: { name: 'draft' } });
    el._onCloseCreatePage();
    finish({ status: 404 });
    await pending;
    expect(save.called).to.equal(false);
    expect(el._createDialog).to.equal(undefined);
  });

  ['scope change', 'reconnection'].forEach((change) => {
    it(`does not save or navigate after a ${change} during editor resolution`, async () => {
      sinon.stub(source, 'getMetadata').resolves({ status: 404 });
      const save = sinon.stub(source, 'save').resolves({ ok: true });
      const navigate = sinon.stub(el, 'navigate');
      let finish;
      const enabled = new Promise((resolve) => { finish = resolve; });
      let started;
      const resolving = new Promise((resolve) => { started = resolve; });
      isEWEnabled.callsFake(() => {
        started();
        return enabled;
      });
      await el._onCreatePage();
      const pending = el._onCreatePageSubmit({ detail: { name: 'draft' } });
      await resolving;
      if (change === 'scope change') el.setScope({ org: 'other', site: 'site' });
      else {
        el.remove();
        document.body.append(el);
      }
      finish(true);
      await pending;
      expect(navigate.called).to.equal(false);
      expect(save.called).to.equal(false);
    });
  });

  [
    { enabled: false, expected: '/edit#/org/site/draft' },
    { enabled: true, expected: '/canvas#/org/site/draft' },
    { enabled: true, configured: 'draft', expected: '/site-editor#/configured/site/draft' },
    { enabled: true, configured: 'form', expected: '/form-editor#/configured/site/form' },
  ].forEach(({ enabled, configured, expected }) => {
    it(`creates and opens a page using ${expected}`, async () => {
      sinon.stub(source, 'getMetadata').resolves({ status: 404 });
      const save = sinon.stub(source, 'save').resolves({ ok: true });
      isEWEnabled.resolves(enabled);
      if (configured) {
        el.setScope({ org: 'configured', site: 'site' });
        config.get.callsFake(async ({ site }) => ({
          ok: true,
          json: async () => ({
            data: site ? [
              { key: 'editor.path', value: '/configured/site=/site-editor#' },
            ] : [
              { key: 'editor.path', value: '/configured/site=/org-editor#' },
              { key: 'editor.path', value: '/configured/site/form=/form-editor#' },
            ],
          }),
        }));
      }
      const [, create] = await getTiles();
      create.shadowRoot.querySelector('button').click();
      await customElements.whenDefined('da-name-dialog');
      await el.updateComplete;
      const dialog = el.shadowRoot.querySelector('da-name-dialog');
      await dialog.updateComplete;
      const opened = new Promise((resolve) => { sinon.stub(el, 'navigate').callsFake(resolve); });
      dialog.shadowRoot.querySelector('input').value = configured || 'draft';
      dialog.shadowRoot.querySelector('.nx-form-btn-primary').click();
      expect(await opened).to.equal(expected);
      expect(save.calledOnce).to.equal(true);
      expect(save.firstCall.args[0]).to.equal(`/${configured ? 'configured' : 'org'}/site/${configured || 'draft'}.html`);
    });
  });

  it('hides all tiles and defers content until a site is selected', async () => {
    el.remove();
    hashChange._set(undefined);
    el = document.createElement('da-landing-tiles');
    el.contentBlock = new DOMParser().parseFromString(content, 'text/html').querySelector('.landing');
    const fetchContent = sinon.spy(window, 'fetch');
    document.body.append(el);
    await el.updateComplete;
    expect(el.entries).to.equal(undefined);
    expect(el.shadowRoot.querySelector('.tile-group')).to.equal(null);
    hashChange._set({ org: 'org', site: 'site' });
    await el.updateComplete;
    expect(await getTiles()).to.have.length(5);
    expect(fetchContent.called).to.equal(false);
    hashChange._set(undefined);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.tile-group')).to.equal(null);
  });

  it('reports enabled tile clicks to RUM', async () => {
    const { hlx } = window;
    const sampleRUM = sinon.spy();
    const stopNavigation = (event) => event.preventDefault();
    window.hlx = { rum: { sampleRUM } };
    document.addEventListener('click', stopNavigation);
    try {
      const [browse, create] = await getTiles();
      browse.shadowRoot.querySelector('a').click();
      create.shadowRoot.querySelector('button').click();
      expect(sampleRUM.args).to.deep.equal([
        ['click', { source: 'landing-action-browse-content', target: browse.href }],
        ['click', { source: 'landing-action-create-a-page', target: 'create-page' }],
      ]);
    } finally {
      document.removeEventListener('click', stopNavigation);
      window.hlx = hlx;
    }
  });
});
