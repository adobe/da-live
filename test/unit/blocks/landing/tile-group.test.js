import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { sendKeys, sendMouse } from '@web/test-runner-commands';
import '../../setup-nx.js';
import init, { parseTileEntries } from '../../../../blocks/landing/tile-group.js';
import { getNx2Api, getNxEWFlags } from '../../../../scripts/utils.js';

const { source, config } = await getNx2Api();
const { setEWEnabled } = await getNxEWFlags();
const content = await fetch('/test/fixtures/landing-tiles.html').then((response) => response.text());
const sheet = new CSSStyleSheet();
sheet.replaceSync(await fetch('/blocks/landing/tile-group.css').then((response) => response.text()));

describe('landing tile group', () => {
  let el;

  const getTiles = async () => {
    await el.updateComplete;
    return [...el.shadowRoot.querySelectorAll('.tile')];
  };

  beforeEach(async () => {
    sinon.stub(config, 'get').resolves({ ok: false, status: 404 });
    el = document.createElement('da-landing-tiles');
    el.setScope({ org: 'org', site: 'site' });
    el.entries = parseTileEntries(new DOMParser().parseFromString(content, 'text/html').querySelector('.landing'));
    document.body.append(el);
    await el.updateComplete;
  });

  afterEach(() => {
    el.remove();
    sinon.restore();
    setEWEnabled(async () => false);
  });

  it('uses authored order, text and tone instead of tile titles or positions', async () => {
    el.entries = [
      { ...el.entries[1], heading: 'Write something', tone: 'purple' },
      { ...el.entries[0], heading: 'Open files', tone: 'orange' },
    ];
    await el.updateComplete;
    const tiles = await getTiles();
    expect(tiles.map((tile) => tile.querySelector('h3').textContent)).to.deep.equal(['Write something', 'Open files']);
    expect(tiles[0].querySelector('.icon').classList.contains('purple')).to.equal(true);
    expect(tiles[0].querySelector('.icon').getAttribute('aria-hidden')).to.equal('true');
    expect(tiles[0].querySelector('p').textContent).to.equal(el.entries[0].description);
    expect(new URL(tiles[1].href).hash).to.equal('#/org/site');
  });

  it('updates Browse when the selected site changes', async () => {
    const [browse] = await getTiles();
    expect(new URL(browse.href).hash).to.equal('#/org/site');
    el.setScope({ org: 'other', site: 'site' });
    await el.updateComplete;
    expect(new URL(browse.href).hash).to.equal('#/other/site');
  });

  it('opens the shared name dialog from Create a page', async () => {
    const [, create] = await getTiles();
    expect(create.href).to.equal(undefined);
    create.click();
    await customElements.whenDefined('da-name-dialog');
    await el.updateComplete;
    const dialog = el.shadowRoot.querySelector('da-name-dialog');
    expect(dialog.getAttribute('dialog-title')).to.equal('New page in site');
    el.setScope({ org: 'other', site: 'site' });
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
      setEWEnabled(() => {
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
      setEWEnabled(async () => enabled);
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
      create.click();
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

  it('loads content without a site and disables only the tiles that need one', async () => {
    el.remove();
    el = init(document.body, { contentBlock: new DOMParser().parseFromString(content, 'text/html').querySelector('.landing') });
    await el.updateComplete;
    const [browse, create, , , develop] = await getTiles();
    expect(browse.href).to.equal(undefined);
    expect(browse.disabled).to.equal(true);
    expect(create.disabled).to.equal(true);
    expect(develop.href).to.equal('https://www.aem.live/developer/tutorial');
  });

  it('reports missing authored tiles without fetching fallback content', async () => {
    el.remove();
    const fetchContent = sinon.spy(window, 'fetch');
    el = document.createElement('da-landing-tiles');
    document.body.append(el);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.equal('No quick links are configured.');
    expect(el.shadowRoot.querySelector('[role="status"], .tile')).to.equal(null);
    expect(fetchContent.called).to.equal(false);
  });

  it('reports tile clicks to RUM, but not clicks on disabled tiles', async () => {
    const { hlx } = window;
    const sampleRUM = sinon.spy();
    const stopNavigation = (event) => event.preventDefault();
    window.hlx = { rum: { sampleRUM } };
    document.addEventListener('click', stopNavigation);
    try {
      const [browse, create] = await getTiles();
      browse.click();
      create.click();
      expect(sampleRUM.args).to.deep.equal([
        ['click', { source: 'landing-action-browse-content', target: browse.href }],
        ['click', { source: 'landing-action-create-a-page', target: 'create-page' }],
      ]);
      el.setScope(undefined);
      await el.updateComplete;
      await getTiles();
      create.click();
      expect(sampleRUM.callCount).to.equal(2);
    } finally {
      document.removeEventListener('click', stopNavigation);
      window.hlx = hlx;
    }
  });

  it('uses native keyboard links and actions, skipping disabled tiles', async () => {
    const clicked = sinon.stub(el, '_onTileClick');
    el.shadowRoot.addEventListener('click', (event) => event.preventDefault());
    // eslint-disable-next-line no-script-url
    el.entries = [el.entries[0], el.entries[1], { ...el.entries[0], href: 'javascript:alert(1)' }];
    const [browse, create, disabled] = await getTiles();
    const after = document.createElement('button');
    document.body.append(after);
    try {
      expect(browse.localName).to.equal('a');
      expect(create.localName).to.equal('button');
      expect(disabled.localName).to.equal('button');
      expect(disabled.disabled).to.equal(true);
      browse.focus();
      await sendKeys({ press: 'Enter' });
      await sendKeys({ press: 'Tab' });
      expect(el.shadowRoot.activeElement).to.equal(create);
      await sendKeys({ press: 'Enter' });
      await sendKeys({ press: 'Space' });
      expect(clicked.callCount).to.equal(3);
      await sendKeys({ press: 'Tab' });
      expect(document.activeElement).to.equal(after);
      disabled.click();
      expect(clicked.callCount).to.equal(3);
    } finally {
      after.remove();
    }
  });

  it('sends clicks on icons, titles and descriptions to their native link or button', async () => {
    sinon.stub(el, '_onTileClick');
    el.shadowRoot.adoptedStyleSheets = [sheet];
    el.style.width = '348px';
    const clicks = [];
    el.shadowRoot.addEventListener('click', (event) => {
      event.preventDefault();
      clicks.push(event.target);
    });
    const entries = el.entries.slice(0, 2);
    for (const entry of entries) {
      el.entries = [entry];
      const [surface] = await getTiles();
      for (const selector of ['.icon', 'h3', 'p']) {
        const bounds = surface.querySelector(selector).getBoundingClientRect();
        await sendMouse({
          type: 'click',
          position: [
            Math.round(bounds.x + bounds.width / 2),
            Math.round(bounds.y + bounds.height / 2),
          ],
        });
        expect(clicks.at(-1)).to.equal(surface);
      }
    }
    expect(clicks).to.have.length(6);
  });
});

describe('authored landing tiles', () => {
  afterEach(() => sinon.restore());

  it('reads the published three-column table without executing or rendering the Browse block', () => {
    const doc = new DOMParser().parseFromString(content, 'text/html');
    const entries = parseTileEntries(doc.querySelector('.landing'));
    expect(entries).to.have.length(5);
    expect(entries[0]).to.deep.equal({
      id: 'browse-content',
      heading: 'Browse Content',
      description: 'View your recent, favorite, or other content by their organization',
      iconHref: '/img/icons/s2-icon-folderopen-20-n.svg',
      href: '/#/%7Borg%7D/%7Bsite%7D',
      tone: 'turquoise',
    });
  });

  it('accepts published icon spans, reads nested paragraphs once and reports dropped rows', () => {
    const block = document.createElement('div');
    block.innerHTML = `<div>
      <div><p><span class="icon icon-s2-icon-edit-20-n"></span></p></div>
      <div><h3><a href="/guide">Guide</a></h3><ul><li><p>Read the guide</p></li></ul></div>
      <div></div>
    </div>`;
    block.insertAdjacentHTML('beforeend', '<div><div>no icon</div><div><h3><a href="/x">X</a></h3></div></div>');
    const warn = sinon.stub(console, 'warn');
    const [entry, ...rest] = parseTileEntries(block);
    expect(rest).to.have.length(0);
    expect(warn.calledOnceWith(sinon.match.string, block.lastElementChild)).to.equal(true);
    expect(entry.iconHref).to.equal('/img/icons/s2-icon-edit-20-n.svg');
    expect(entry.description).to.equal('Read the guide');
    expect(entry.tone).to.equal(undefined);
  });

  it('honors editable metadata and row order, ignoring incomplete rows', () => {
    const doc = new DOMParser().parseFromString(content, 'text/html');
    const block = doc.querySelector('.landing');
    const row = block.lastElementChild;
    row.children[1].querySelector('a').textContent = 'Custom heading';
    row.lastElementChild.innerHTML = '<h3>tone: purple</h3><h3>id: stable-action</h3>';
    block.prepend(row);
    block.append(document.createElement('div'));
    const entries = parseTileEntries(block);
    expect(entries).to.have.length(5);
    expect(entries[0].heading).to.equal('Custom heading');
    expect(entries[0].tone).to.equal('purple');
    expect(entries[0].id).to.equal('stable-action');
    expect(parseTileEntries(null)).to.deep.equal([]);
  });
});
