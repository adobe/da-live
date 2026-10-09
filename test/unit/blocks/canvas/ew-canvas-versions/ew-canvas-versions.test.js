/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx, getNx, getNx2Api } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const nextFrame = () => new Promise((r) => { setTimeout(r, 0); });

let buildDocPath;
let getExtensionsBridge;
let popoverShow;

before(async () => {
  ({ buildDocPath } = await import('../../../../../blocks/canvas/ew-canvas-versions/ew-canvas-versions.js'));
  ({ getExtensionsBridge } = await import('../../../../../blocks/canvas/editor-utils/extensions-bridge.js'));
  const popover = customElements.get('nx-popover').prototype;
  popoverShow = popover.show;
  popover.show = () => {};
});

after(() => { customElements.get('nx-popover').prototype.show = popoverShow; });

async function createInstance(props = {}) {
  const inst = document.createElement('ew-canvas-versions');
  document.body.appendChild(inst);
  await inst.updateComplete;
  Object.assign(inst, props);
  await inst.updateComplete;
  await nextFrame();
  return inst;
}

const ver = (overrides = {}) => ({ isVersion: true, date: 'Jan 1', time: '10:00', users: [], ...overrides });

const auditGroup = (audits = [{ date: 'Jan 1', time: '09:00', users: [] }]) => ({ date: 'Jan 1', audits });

describe('version image previews', () => {
  let inst;
  afterEach(() => { inst?.remove(); });

  it('resolves media images in a version preview without changing restore content', async () => {
    const dom = document.createElement('div');
    dom.innerHTML = '<p><img src="./media_123.png"></p>';
    inst = document.createElement('ew-canvas-compare');
    Object.assign(inst, { dom, path: '/org/repo/doc.html', label: 'Published' });
    document.body.appendChild(inst);
    await inst.updateComplete;
    expect(inst.shadowRoot.querySelector('.ew-cc-body img').getAttribute('src'))
      .to.equal('https://main--repo--org.stage-preview.da.live/media_123.png');
    expect(dom.querySelector('img').getAttribute('src')).to.equal('./media_123.png');
  });

  it('updates image URLs when switching versions and leaves absolute URLs alone', async () => {
    const dom = document.createElement('div');
    dom.innerHTML = '<p><img src="./media_first.png"><img src="https://example.com/image.png"></p>';
    inst = document.createElement('ew-canvas-compare');
    Object.assign(inst, { dom, path: '/org/repo/doc.html', label: 'First' });
    document.body.appendChild(inst);
    await inst.updateComplete;
    expect(inst.shadowRoot.querySelectorAll('.ew-cc-body img')[1].getAttribute('src'))
      .to.equal('https://example.com/image.png');
    const nextDom = document.createElement('div');
    nextDom.innerHTML = '<p><img src="./media_second.png"></p>';
    inst.dom = nextDom;
    await inst.updateComplete;
    expect(inst.shadowRoot.querySelector('.ew-cc-body img').getAttribute('src'))
      .to.equal('https://main--repo--org.stage-preview.da.live/media_second.png');
    inst.path = '/org/other/doc.html';
    await inst.updateComplete;
    expect(inst.shadowRoot.querySelector('.ew-cc-body img').getAttribute('src'))
      .to.equal('https://main--other--org.stage-preview.da.live/media_second.png');
  });

  it('resolves images in both comparison panes without changing diff content', async () => {
    const diffDom = document.createElement('div');
    diffDom.innerHTML = '<p><del><img src="./media_old.png"></del><ins><img src="./media_new.png"></ins></p>';
    inst = document.createElement('ew-canvas-compare');
    Object.assign(inst, { diffDom, path: '/org/repo/doc.html', label: 'Published', split: true });
    document.body.appendChild(inst);
    await inst.updateComplete;
    const images = inst.shadowRoot.querySelectorAll('.ew-cc-pane img');
    expect([...images].map((img) => img.getAttribute('src'))).to.deep.equal([
      'https://main--repo--org.stage-preview.da.live/media_old.png',
      'https://main--repo--org.stage-preview.da.live/media_new.png',
    ]);
    expect([...diffDom.querySelectorAll('img')].map((img) => img.getAttribute('src')))
      .to.deep.equal(['./media_old.png', './media_new.png']);
  });
});

// ─── _filteredVersions ───────────────────────────────────────────────────────

describe('_filteredVersions', () => {
  const ME = 'me@example.com';
  const OTHER = 'other@example.com';
  let inst;
  before(async () => { inst = await createInstance(); });
  after(() => { inst.remove(); });

  it('returns all entries when filter is "all"', () => {
    inst._versions = [ver({ users: [{ email: OTHER }] })];
    inst._filter = 'all';
    inst._imsEmail = ME;
    expect(inst._filteredVersions).to.have.lengthOf(1);
  });

  it('returns all entries when imsEmail is null (IMS unavailable)', () => {
    inst._versions = [ver({ users: [{ email: OTHER }] })];
    inst._filter = 'me';
    inst._imsEmail = null;
    expect(inst._filteredVersions).to.have.lengthOf(1);
  });

  it('keeps version entries whose users include the current email', () => {
    inst._versions = [
      ver({ users: [{ email: ME }] }),
      ver({ users: [{ email: OTHER }] }),
    ];
    inst._filter = 'me';
    inst._imsEmail = ME;
    const result = inst._filteredVersions;
    expect(result).to.have.lengthOf(1);
    expect(result[0].users[0].email).to.equal(ME);
  });

  it('keeps audit groups where any audit entry belongs to the current user', () => {
    inst._versions = [
      auditGroup([{ users: [{ email: ME }] }]),
      auditGroup([{ users: [{ email: OTHER }] }]),
    ];
    inst._filter = 'me';
    inst._imsEmail = ME;
    expect(inst._filteredVersions).to.have.lengthOf(1);
  });
});

// ─── Component behaviour ─────────────────────────────────────────────────────

describe('ew-canvas-versions', () => {
  let inst;
  afterEach(() => {
    inst?.remove(); inst = null;
  });

  it('appends .html to the path component when building the document path', () => {
    expect(buildDocPath({ org: 'myorg', site: 'mysite', path: 'docs/page' })).to.equal('/myorg/mysite/docs/page.html');
  });

  it('returns empty string when any hash state field is missing', () => {
    expect(buildDocPath({ org: 'myorg', site: 'mysite' })).to.equal('');
    expect(buildDocPath(null)).to.equal('');
  });

  it('shows placeholder when no path is set', async () => {
    inst = await createInstance();
    expect(inst.shadowRoot.querySelector('.placeholder')).to.exist;
    expect(inst.shadowRoot.querySelector('.toolbar')).to.not.exist;
  });

  it('opens restore dialog showing the entry label', async () => {
    inst = await createInstance({ path: '/org/site/doc.html', _versions: [] });
    await inst.updateComplete;
    inst.handleRestoreClick(ver({ label: 'Sprint 42' }));
    await inst.updateComplete;
    const dialog = inst.shadowRoot.querySelector('nx-dialog.ew-cv-restore');
    expect(dialog).to.exist;
    expect(dialog.textContent).to.include('Sprint 42');
  });

  it('falls back to entry date in restore dialog when label is absent', async () => {
    inst = await createInstance({ path: '/org/site/doc.html', _versions: [] });
    await inst.updateComplete;
    inst.handleRestoreClick(ver({ date: 'Jan 5', label: undefined }));
    await inst.updateComplete;
    const dialog = inst.shadowRoot.querySelector('nx-dialog.ew-cv-restore');
    expect(dialog.textContent).to.include('Jan 5');
  });

  it('removes restore dialog when handleRestoreCancel is called', async () => {
    inst = await createInstance({ path: '/org/site/doc.html', _versions: [] });
    await inst.updateComplete;
    inst.handleRestoreClick(ver());
    await inst.updateComplete;
    inst.handleRestoreCancel();
    await inst.updateComplete;
    expect(inst.shadowRoot.querySelector('nx-dialog.ew-cv-restore')).to.not.exist;
    expect(inst._restoreEntry).to.be.null;
  });

  it('clicking "Only me" updates aria-pressed and _filter', async () => {
    inst = await createInstance({ path: '/org/site/doc.html', _versions: [] });
    await inst.updateComplete;
    const [allBtn, meBtn] = inst.shadowRoot.querySelectorAll('.seg-btn');
    meBtn.click();
    await inst.updateComplete;
    expect(inst._filter).to.equal('me');
    expect(meBtn.getAttribute('aria-pressed')).to.equal('true');
    expect(allBtn.getAttribute('aria-pressed')).to.equal('false');
  });

  it('handleCloseCompare calls cleanup and clears _compareCtx', async () => {
    inst = await createInstance();
    let cleaned = false;
    inst._compareCtx = {
      previewDom: document.createElement('div'),
      diffDom: null,
      cleanup: () => { cleaned = true; },
      label: 'v1',
      entry: {},
    };
    inst.handleCloseCompare();
    expect(inst._compareCtx).to.be.null;
    expect(cleaned).to.be.true;
  });
});

describe('version history refresh', () => {
  const path = '/refreshorg/refreshsite/page.html';
  const old = {
    url: '/versionsource/refreshorg/refreshsite/old.html',
    timestamp: 1000,
    label: 'Older version',
    users: [{ email: 'me@example.com' }],
  };
  const latest = {
    url: '/versionsource/refreshorg/refreshsite/latest.html',
    timestamp: 2000,
    label: 'Previewed',
    users: [{ email: 'other@example.com' }],
  };
  let inst;
  let savedFetch;
  let toasts;
  let hashChange;
  let initIms;

  before(async () => {
    ({ toasts } = await import(`${getNx()}/blocks/shared/toast/toast.js`));
    ({ hashChange } = await import(`${getNx()}/utils/utils.js`));
    ({ initIms } = await import('../../../../../blocks/shared/utils.js'));
    await initIms();
    await getNx2Api();
  });

  beforeEach(() => { savedFetch = window.fetch; });

  afterEach(() => {
    inst?.remove();
    inst = null;
    window.fetch = savedFetch;
    toasts.length = 0;
    hashChange._set({});
    getExtensionsBridge().view = null;
  });

  function mockList(respond) {
    window.fetch = (url, opts) => {
      if (url.includes('/ping/refreshorg/refreshsite')) {
        return Promise.resolve(new Response('', { status: 200 }));
      }
      if (url.includes('/versionlist/refreshorg/refreshsite/')) return respond(url);
      return savedFetch(url, opts);
    };
  }

  const response = (entries) => new Response(JSON.stringify(entries), { status: 200 });

  async function waitFor(check) {
    const deadline = Date.now() + 2000;
    while (!check()) {
      if (Date.now() > deadline) throw new Error('Version history did not finish updating.');
      await new Promise((resolve) => { setTimeout(resolve, 10); });
    }
    await inst.updateComplete;
  }

  it('offers a labelled refresh action and keeps history visible while loading', async () => {
    let finish;
    let calls = 0;
    mockList(() => {
      calls += 1;
      return new Promise((resolve) => { finish = resolve; });
    });
    const entries = [ver(old)];
    inst = await createInstance({ path, _versions: entries });
    const list = inst.shadowRoot.querySelector('.versionlist');
    const button = inst.shadowRoot.querySelector('.refresh-btn');
    expect(button.getAttribute('aria-label')).to.equal('Refresh version history');
    button.click();
    await nextFrame();
    await inst.updateComplete;
    expect(button.disabled).to.be.true;
    expect(button.querySelector('.da-loading-spinner')).to.exist;
    expect(inst.shadowRoot.querySelector('.versionlist')).to.equal(list);
    expect(inst._versions).to.equal(entries);
    button.click();
    expect(calls).to.equal(1);
    finish(response([latest, old]));
    await waitFor(() => !inst._refreshing);
    expect(inst._versions.map((entry) => entry.label)).to.deep.equal(['Previewed', 'Older version']);
    expect(button.disabled).to.be.false;
    expect(inst.shadowRoot.querySelector('.ew-canvas-versions').getAttribute('aria-busy')).to.equal('false');
  });

  it('automatically reloads history on successful version creation for this document', async () => {
    let calls = 0;
    mockList(() => {
      calls += 1;
      return Promise.resolve(response([latest, old]));
    });
    inst = await createInstance({ path, _versions: [ver(old)] });
    document.dispatchEvent(new CustomEvent('nx-version-created', { detail: { path } }));
    await nextFrame();
    await inst.updateComplete;
    expect(calls).to.equal(1);
    expect(inst._versions[0].label).to.equal('Previewed');
  });

  it('does not refresh for another document or after disconnection', async () => {
    let calls = 0;
    mockList(() => {
      calls += 1;
      return Promise.resolve(response([latest, old]));
    });
    inst = await createInstance({ path, _versions: [ver(old)] });
    document.dispatchEvent(new CustomEvent('nx-version-created', { detail: { path: '/refreshorg/refreshsite/other.html' } }));
    inst.remove();
    document.dispatchEvent(new CustomEvent('nx-version-created', { detail: { path } }));
    await nextFrame();
    expect(calls).to.equal(0);
  });

  it('fetches other authors versions while retaining the Only me filter', async () => {
    mockList(() => Promise.resolve(response([latest, old])));
    inst = await createInstance({ path, _versions: [ver(old)], _filter: 'me' });
    await initIms();
    inst._imsEmail = 'me@example.com';
    await inst.handleRefresh();
    expect(inst._versions).to.have.lengthOf(2);
    expect(inst._filter).to.equal('me');
    expect(inst._filteredVersions.map((entry) => entry.label)).to.deep.equal(['Older version']);
    inst._setFilter('all');
    await inst.updateComplete;
    expect(inst.shadowRoot.textContent).to.include('Previewed');
  });

  it('keeps version rows, expanded changes, focus, and document content intact', async () => {
    const audit = { timestamp: 500, date: 'Jan 1', time: '09:00', users: [] };
    mockList(() => Promise.resolve(response([latest, old, audit])));
    const view = {
      editable: true,
      state: { doc: 'shared content' },
      dispatch: () => {
        throw new Error('History refresh must not dispatch an editor transaction.');
      },
    };
    getExtensionsBridge().view = view;
    inst = await createInstance({ path, _versions: [ver(old), auditGroup([audit])] });
    const row = inst.shadowRoot.querySelector('.is-version');
    const details = inst.shadowRoot.querySelector('details');
    details.open = true;
    const trigger = row.querySelector('.version-row');
    trigger.focus();
    inst._compareTrigger = trigger;
    await inst.handleRefresh();
    expect([...inst.shadowRoot.querySelectorAll('.is-version')]).to.include(row);
    expect(inst.shadowRoot.querySelector('details')).to.equal(details);
    expect(details.open).to.be.true;
    expect(inst.shadowRoot.activeElement).to.equal(trigger);
    expect(inst._compareTrigger).to.equal(trigger);
    expect(getExtensionsBridge().view).to.equal(view);
    expect(view.state.doc).to.equal('shared content');
  });

  it('preserves an open comparison, restore dialog, and unsaved version name', async () => {
    mockList(() => Promise.resolve(response([latest, old])));
    inst = await createInstance({ path, _versions: [ver(old)] });
    inst.handleNew();
    const previewDom = document.createElement('div');
    previewDom.textContent = 'Earlier content';
    const comparison = { previewDom, label: 'Older version', entry: old };
    inst._compareCtx = comparison;
    inst._restoreEntry = old;
    await inst.updateComplete;
    const input = inst.shadowRoot.querySelector('.da-input');
    input.value = 'Unsubmitted name';
    await inst.handleRefresh();
    expect(inst._compareCtx).to.equal(comparison);
    expect(inst._restoreEntry).to.equal(old);
    expect(inst.shadowRoot.querySelector('.da-input')).to.equal(input);
    expect(input.value).to.equal('Unsubmitted name');
  });

  it('preserves the visible row when new versions are inserted above the scroll position', async () => {
    const entries = Array.from({ length: 20 }, (_, index) => ({ ...old, url: `/versionsource/refreshorg/refreshsite/v${index}.html`, timestamp: 1000 - index }));
    mockList(() => Promise.resolve(response([latest, ...entries])));
    inst = await createInstance({ path, _versions: entries.map((entry) => ver(entry)) });
    const list = inst.shadowRoot.querySelector('.versionlist');
    list.style.cssText = 'height: 100px; overflow: auto; margin: 0; padding: 0;';
    [...list.children].forEach((row) => { row.style.height = '40px'; });
    list.scrollTop = 300;
    const anchor = [...list.children]
      .find((row) => row.getBoundingClientRect().bottom > list.getBoundingClientRect().top);
    const { top } = anchor.getBoundingClientRect();
    await inst.handleRefresh();
    expect(anchor.isConnected).to.be.true;
    expect(anchor.getBoundingClientRect().top).to.be.closeTo(top, 1);
  });

  it('retains last loaded history and reports a refresh failure', async () => {
    mockList(() => Promise.resolve(new Response('', { status: 500 })));
    const entries = [ver(old)];
    inst = await createInstance({ path, _versions: entries });
    await inst.handleRefresh();
    await nextFrame();
    expect(inst._versions).to.equal(entries);
    expect(inst.shadowRoot.textContent).to.include('Older version');
    expect(inst._refreshing).to.be.false;
    expect(toasts.at(-1)).to.deep.equal({ text: 'Could not load version history. Please try again.', variant: 'error' });
  });

  it('shows an initial load error rather than an empty history and allows retry', async () => {
    mockList(() => Promise.resolve(new Response('', { status: 403 })));
    inst = await createInstance({ path });
    await inst._load();
    await nextFrame();
    await inst.updateComplete;
    expect(inst._versions).to.be.undefined;
    expect(inst.shadowRoot.querySelector('[role="alert"]').textContent).to.include('Use Refresh');
    expect(inst.shadowRoot.querySelector('.refresh-btn').disabled).to.be.false;
    mockList(() => Promise.resolve(response([latest, old])));
    await inst.handleRefresh();
    expect(inst._loadError).to.be.false;
    expect(inst._versions).to.have.lengthOf(2);
  });

  it('ignores an older request that finishes after a newer refresh', async () => {
    const pending = [];
    mockList(() => new Promise((resolve) => { pending.push(resolve); }));
    inst = await createInstance({ path, _versions: [ver(old)] });
    const first = inst.handleRefresh();
    await nextFrame();
    const second = inst.handleRefresh();
    await nextFrame();
    pending[1](response([latest, old]));
    await second;
    pending[0](response([old]));
    await first;
    expect(inst._versions[0].label).to.equal('Previewed');
  });

  it('does not apply a previous document response after navigation', async () => {
    let finish;
    mockList((url) => (url.endsWith('/page.html')
      ? new Promise((resolve) => { finish = resolve; })
      : Promise.resolve(response([]))));
    inst = await createInstance({ path, _versions: [ver(old)] });
    const refreshing = inst.handleRefresh();
    await nextFrame();
    hashChange._set({ org: 'refreshorg', site: 'refreshsite', path: 'other' });
    await nextFrame();
    finish(response([latest, old]));
    await refreshing;
    expect(inst.path).to.equal('/refreshorg/refreshsite/other.html');
    expect(inst._versions).to.deep.equal([]);
  });

  it('discards pending results when the component disconnects', async () => {
    let finish;
    mockList(() => new Promise((resolve) => { finish = resolve; }));
    const entries = [ver(old)];
    inst = await createInstance({ path, _versions: entries });
    const refreshing = inst.handleRefresh();
    await nextFrame();
    inst.remove();
    finish(response([latest, old]));
    await refreshing;
    expect(inst._versions).to.equal(entries);
    expect(inst._refreshing).to.be.false;
  });
});

// ─── Create-version form ─────────────────────────────────────────────────────

describe('create-version form', () => {
  let inst;
  afterEach(() => {
    inst?.remove(); inst = null;
  });

  it('handleNew opens the form with a prefilled, focused, selected input', async () => {
    inst = await createInstance({ path: '/org/site/doc.html', _versions: [] });
    await inst.updateComplete;
    inst.handleNew();
    await inst.updateComplete;
    const input = inst.shadowRoot.querySelector('.da-input');
    expect(input).to.exist;
    expect(input.value).to.equal(`Version ${inst._newVersion.date}`);
    expect(inst.shadowRoot.activeElement).to.equal(input);
    expect(input.selectionStart).to.equal(0);
    expect(input.selectionEnd).to.equal(input.value.length);
  });

  it('handleCancel closes the form back to the Current row', async () => {
    inst = await createInstance({ path: '/org/site/doc.html', _versions: [] });
    await inst.updateComplete;
    inst.handleNew();
    await inst.updateComplete;
    inst.handleCancel();
    await inst.updateComplete;
    expect(inst._newVersion).to.be.null;
    expect(inst.shadowRoot.querySelector('.da-input')).to.not.exist;
    expect(inst.shadowRoot.querySelector('.versionname').textContent).to.equal('Current');
  });

  it('pressing Escape in the form cancels it', async () => {
    inst = await createInstance({ path: '/org/site/doc.html', _versions: [] });
    await inst.updateComplete;
    inst.handleNew();
    await inst.updateComplete;
    const form = inst.shadowRoot.querySelector('.ew-cv-new-row');
    form.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await inst.updateComplete;
    expect(inst._newVersion).to.be.null;
    expect(inst.shadowRoot.querySelector('.da-input')).to.not.exist;
  });

  it('pressing a non-Escape key in the form leaves it open', async () => {
    inst = await createInstance({ path: '/org/site/doc.html', _versions: [] });
    await inst.updateComplete;
    inst.handleNew();
    await inst.updateComplete;
    const form = inst.shadowRoot.querySelector('.ew-cv-new-row');
    form.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await inst.updateComplete;
    expect(inst._newVersion).to.not.be.null;
    expect(inst.shadowRoot.querySelector('.da-input')).to.exist;
  });

  it('while saving, disables the actions, makes the input read-only, and swaps Save for a labelled spinner', async () => {
    inst = await createInstance({ path: '/org/site/doc.html', _versions: [] });
    await inst.updateComplete;
    inst.handleNew();
    inst._savingVersion = true;
    await inst.updateComplete;
    const input = inst.shadowRoot.querySelector('.da-input');
    const saveBtn = inst.shadowRoot.querySelector('.ew-cv-save-btn');
    const cancelBtn = inst.shadowRoot.querySelector('.ew-cv-new-actions .da-icon-btn');
    expect(input.readOnly).to.be.true;
    expect(input.disabled).to.be.false;
    expect(cancelBtn.disabled).to.be.true;
    expect(saveBtn.disabled).to.be.true;
    expect(saveBtn.getAttribute('aria-label')).to.equal('Saving');
    expect(saveBtn.querySelector('.da-loading-spinner')).to.exist;
  });
});

// ─── Restore menu permission gating ─────────────────────────────────────────

describe('version menu restore gating', () => {
  let inst;

  afterEach(() => {
    getExtensionsBridge().view = null;
    inst?.remove(); inst = null;
  });

  async function hasRestoreButton() {
    inst = await createInstance({ path: '/org/site/doc.html', _versions: [ver()] });
    await inst.updateComplete;
    const items = inst.shadowRoot.querySelector('nx-menu')?.items ?? [];
    return items.some((i) => i.id === 'restore');
  }

  it('omits Restore when there is no editor view', async () => {
    expect(await hasRestoreButton()).to.be.false;
  });

  it('omits Restore when the editor view is read-only', async () => {
    getExtensionsBridge().view = { editable: false };
    expect(await hasRestoreButton()).to.be.false;
  });

  it('includes Restore when the editor view is writable', async () => {
    getExtensionsBridge().view = { editable: true };
    expect(await hasRestoreButton()).to.be.true;
  });
});

// ─── handleToggleCompareSplit — lazy diff build ─────────────────────────────

describe('handleToggleCompareSplit', () => {
  let inst;
  afterEach(() => {
    inst?.remove();
    inst = null;
  });

  it('builds the diff dom on first toggle and flips _compareSplit on', async () => {
    inst = await createInstance({ path: '/org/site/doc.html', _versions: [] });
    await inst.updateComplete;
    const previewDom = document.createElement('div');
    const noop = () => { };
    inst._compareCtx = { previewDom, diffDom: null, cleanup: noop, label: 'v1', entry: {} };
    inst._compareSplit = false;
    const fakeDiffDom = document.createElement('div');
    let buildCalls = 0;
    inst._buildDiff = async (body) => {
      buildCalls += 1;
      expect(body).to.equal(previewDom);
      return { dom: fakeDiffDom, cleanup: () => { } };
    };

    await inst.handleToggleCompareSplit();

    expect(buildCalls).to.equal(1);
    expect(inst._compareCtx.diffDom).to.equal(fakeDiffDom);
    expect(inst._compareSplit).to.be.true;
  });

  it('does not rebuild the diff on a later toggle once already built', async () => {
    inst = await createInstance({ path: '/org/site/doc.html', _versions: [] });
    await inst.updateComplete;
    const diffDom = document.createElement('div');
    const previewDom = document.createElement('div');
    const noop = () => { };
    inst._compareCtx = { previewDom, diffDom, cleanup: noop, label: 'v1', entry: {} };
    inst._compareSplit = true;
    let buildCalls = 0;
    inst._buildDiff = async () => {
      buildCalls += 1;
      return { dom: document.createElement('div'), cleanup: noop };
    };

    await inst.handleToggleCompareSplit();

    expect(buildCalls).to.equal(0);
    expect(inst._compareSplit).to.be.false;
    expect(inst._compareCtx.diffDom).to.equal(diffDom);
  });

  it('does nothing when there is no active compare context', async () => {
    inst = await createInstance({ path: '/org/site/doc.html', _versions: [] });
    await inst.updateComplete;
    inst._compareCtx = null;
    inst._compareSplit = false;

    await inst.handleToggleCompareSplit();

    expect(inst._compareSplit).to.be.false;
  });

  it('leaves diffDom unset and split off when the diff build fails', async () => {
    inst = await createInstance({ path: '/org/site/doc.html', _versions: [] });
    await inst.updateComplete;
    const previewDom = document.createElement('div');
    inst._compareCtx = { previewDom, diffDom: null, cleanup: () => { }, label: 'v1', entry: {} };
    inst._compareSplit = false;
    inst._buildDiff = async () => null;

    await inst.handleToggleCompareSplit();

    expect(inst._compareCtx.diffDom).to.be.null;
    expect(inst._compareSplit).to.be.false;
  });
});
