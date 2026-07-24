import { expect } from '@esm-bundle/chai';
import '../../../../../blocks/canvas/ew-comments/ew-comments.js';

async function makeEl() {
  const el = document.createElement('ew-comments');
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
    createRootComment() { return 'mock-id'; },
    createReply() { return 'mock-reply-id'; },
    resolveThread() {},
    unresolveThread() {},
    deleteComment() {},
    ...overrides,
  };
}

describe('ew-comments', () => {
  let el;
  afterEach(() => {
    el?.remove();
    el = null;
  });

  it('opens a draft when pendingAnchor is set on the controller', async () => {
    const ctrl = makeCtrl({ pendingAnchor: { anchorFrom: [1], anchorTo: [2], anchorType: 'text', anchorText: 'hello' } });

    el = await makeEl();
    el.controller = ctrl;
    await el.updateComplete;

    expect(el._draft?.mode).to.equal('new');
    expect(el._draft?.anchorData.anchorText).to.equal('hello');
  });

  it('clears draft when the controller reports panelOpen=false', async () => {
    let panelOpenHandler = null;
    const ctrl = makeCtrl({
      subscribe(fn) {
        panelOpenHandler = fn;
        fn({ reason: 'init' });
        return () => { panelOpenHandler = null; };
      },
    });

    el = await makeEl();
    el.controller = ctrl;
    await el.updateComplete;

    el._draft = { mode: 'reply', threadId: 't1', text: 'hi' };
    ctrl.panelOpen = false;
    panelOpenHandler({ reason: 'panelOpen' });
    await el.updateComplete;

    expect(el._draft).to.be.null;
  });

  it('submitDraft calls controller.createRootComment and selects the new thread', async () => {
    let createArgs = null;
    let selectedId = null;
    const ctrl = makeCtrl({
      pendingAnchor: { anchorFrom: [1], anchorTo: [2], anchorType: 'text', anchorText: 'hi' },
      createRootComment(args) { createArgs = args; return 'new-id'; },
      setSelectedThread(id) { selectedId = id; },
    });

    el = await makeEl();
    el.controller = ctrl;
    await el.updateComplete;
    el.currentUser = { id: 'u1', name: 'Alice', email: 'a@b.com' };

    el._draft = { mode: 'new', anchorData: ctrl.pendingAnchor, text: 'My comment' };
    await el.submitDraft({ preventDefault() {} });

    expect(createArgs.user.id).to.equal('u1');
    expect(createArgs.anchor.anchorText).to.equal('hi');
    expect(createArgs.body).to.equal('My comment');
    expect(selectedId).to.equal('new-id');
  });

  it('clears pending draft on cancelDraft', async () => {
    let clearedPending = false;
    const ctrl = makeCtrl({
      pendingAnchor: { anchorFrom: [1], anchorTo: [2], anchorType: 'text', anchorText: 'hi' },
      clearPendingAnchor() { clearedPending = true; this.pendingAnchor = null; },
    });

    el = await makeEl();
    el.controller = ctrl;
    await el.updateComplete;
    el.cancelDraft();
    await el.updateComplete;

    expect(el._draft).to.be.null;
    expect(clearedPending).to.be.true;
  });

  it('renders the in-panel close button by default', async () => {
    el = await makeEl();
    el.controller = makeCtrl();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.ew-comments-close-btn')).to.exist;
  });

  it('hides the in-panel close button when embedded', async () => {
    el = await makeEl();
    el.embedded = true;
    el.controller = makeCtrl();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.ew-comments-close-btn')).to.be.null;
  });

  it('shows a loading spinner until the controller reports loaded', async () => {
    el = await makeEl();
    el.controller = makeCtrl({ loaded: false });
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.ew-comments-spinner')).to.exist;

    el.controller = makeCtrl({ loaded: true });
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.ew-comments-spinner')).to.be.null;
  });
});
