/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const nextFrame = () => new Promise((r) => { setTimeout(r, 0); });

let buildDocPath;
let getExtensionsBridge;

before(async () => {
  ({ buildDocPath } = await import('../../../../../blocks/canvas/ew-canvas-versions/ew-canvas-versions.js'));
  ({ getExtensionsBridge } = await import('../../../../../blocks/canvas/editor-utils/extensions-bridge.js'));
});

async function createInstance(props = {}) {
  const inst = document.createElement('ew-canvas-versions');
  Object.assign(inst, props);
  document.body.appendChild(inst);
  await inst.updateComplete;
  await nextFrame();
  return inst;
}

const ver = (overrides = {}) => ({ isVersion: true, date: 'Jan 1', time: '10:00', users: [], ...overrides });

const auditGroup = (audits = [{ date: 'Jan 1', time: '09:00', users: [] }]) => ({ date: 'Jan 1', audits });

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
    const cancelBtn = inst.shadowRoot.querySelector('.da-icon-btn');
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
  afterEach(() => { inst?.remove(); inst = null; });

  it('builds the diff dom on first toggle and flips _compareSplit on', async () => {
    inst = await createInstance({ path: '/org/site/doc.html', _versions: [] });
    await inst.updateComplete;
    const previewDom = document.createElement('div');
    inst._compareCtx = {
      previewDom, diffDom: null, cleanup: () => {}, label: 'v1', entry: {},
    };
    inst._compareSplit = false;
    const fakeDiffDom = document.createElement('div');
    let buildCalls = 0;
    inst._buildDiff = async (body) => {
      buildCalls += 1;
      expect(body).to.equal(previewDom);
      return { dom: fakeDiffDom, cleanup: () => {} };
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
    inst._compareCtx = {
      previewDom: document.createElement('div'), diffDom, cleanup: () => {}, label: 'v1', entry: {},
    };
    inst._compareSplit = true;
    let buildCalls = 0;
    inst._buildDiff = async () => { buildCalls += 1; return { dom: document.createElement('div'), cleanup: () => {} }; };

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
    inst._compareCtx = {
      previewDom: document.createElement('div'), diffDom: null, cleanup: () => {}, label: 'v1', entry: {},
    };
    inst._compareSplit = false;
    inst._buildDiff = async () => null;

    await inst.handleToggleCompareSplit();

    expect(inst._compareCtx.diffDom).to.be.null;
    expect(inst._compareSplit).to.be.false;
  });
});
