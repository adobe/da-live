import { expect } from '@esm-bundle/chai';
import '../../../../../blocks/edit/da-comments/da-comments.js';
import { DRAFT_MODES } from '../../../../../blocks/shared/comments/helpers/draft-state.js';

async function makeEl() {
  const el = document.createElement('da-comments');
  document.body.append(el);
  await el.updateComplete;
  return el;
}

function makeCtrl(overrides = {}) {
  return {
    pendingAnchor: null,
    selectedThreadId: null,
    panelOpen: true,
    loaded: true,
    counts: { active: 0, resolved: 0 },
    hasSelection: false,
    getAttachedThreadIds() { return new Set(); },
    getThreadGroups() { return { active: [], detached: [], resolved: [] }; },
    findThreadForComment() { return null; },
    getCurrentUser() { return null; },
    onCurrentUserChange() { return () => {}; },
    subscribe(fn) { fn({ reason: 'init' }); return () => {}; },
    closePanel() { this.panelOpen = false; },
    clearPendingAnchor() { this.pendingAnchor = null; },
    collapseSelection() {},
    setSelectedThread() {},
    ...overrides,
  };
}

describe('da-comments', () => {
  let el;
  afterEach(() => {
    el?.remove();
    el = null;
  });

  it('dispatches close when handleClose runs', async () => {
    el = await makeEl();
    el.controller = makeCtrl();
    let closed = false;
    el.addEventListener('close', () => { closed = true; });
    el.handleClose();
    expect(closed).to.be.true;
  });

  it('dispatches requestOpen from openCommentsHost', async () => {
    el = await makeEl();
    let opened = false;
    el.addEventListener('requestOpen', () => { opened = true; });
    el.openCommentsHost();
    expect(opened).to.be.true;
  });

  it('does not use the EW inner scroll wrapper', async () => {
    el = await makeEl();
    expect(el.usesPanelScrollWrapper()).to.be.false;
    el.controller = makeCtrl();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.ew-comments-scroll')).to.be.null;
  });

  it('sticks the thread detail block on page scroll', async () => {
    el = await makeEl();
    el.controller = makeCtrl({
      selectedThreadId: 't1',
      getThreadGroups() {
        return {
          active: [{
            id: 't1',
            replies: [],
            resolved: false,
            author: { id: 'u1', name: 'Alice', email: 'a@b.com' },
            body: 'hello',
            createdAt: '2026-01-01T00:00:00Z',
          }],
          detached: [],
          resolved: [],
        };
      },
    });
    await el.updateComplete;
    const thread = el.shadowRoot.querySelector('.ew-comments-thread-detail');
    expect(thread).to.exist;
    expect(getComputedStyle(thread).position).to.equal('sticky');
  });

  it('sticks the compose form on page scroll', async () => {
    el = await makeEl();
    el._draft = { mode: DRAFT_MODES.NEW, anchorData: { from: 1, to: 2 }, text: '' };
    el.controller = makeCtrl({ getCurrentUser() { return { id: 'u1', name: 'Alice' }; } });
    await el.updateComplete;
    await el.updateComplete;
    const composer = el.shadowRoot.querySelector('.ew-comments-inline-composer');
    expect(composer).to.exist;
    expect(getComputedStyle(composer).position).to.equal('sticky');
  });
});
