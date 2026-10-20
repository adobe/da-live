import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

before(async () => {
  await import('../../../../../blocks/canvas/comments/comments-panel.js');
});

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
    setPanelOpen(value) { this.panelOpen = value; },
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

  it('shows a loading spinner until the controller reports loaded', async () => {
    el = await makeEl();
    el.controller = makeCtrl({ loaded: false });
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.ew-comments-spinner')).to.exist;

    el.controller = makeCtrl({ loaded: true });
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.ew-comments-spinner')).to.be.null;
  });

  it('emphasizes the prerequisite in the list hint', async () => {
    el = await makeEl();
    el.controller = makeCtrl();
    await el.updateComplete;

    const listHint = el.shadowRoot.querySelector('.ew-comments-list > .da-hint');
    const prerequisite = listHint?.querySelector('strong');

    expect(prerequisite?.textContent.trim()).to.equal('Select content');
  });

  it('renders contextual shortcut copy for new comments', async () => {
    const currentUser = { id: 'u1', name: 'Alice', email: 'a@b.com' };
    const ctrl = makeCtrl({
      pendingAnchor: { anchorFrom: [1], anchorTo: [2], anchorType: 'text', anchorText: 'hello' },
      getCurrentUser() { return currentUser; },
    });

    el = await makeEl();
    el.controller = ctrl;
    await el.updateComplete;
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    await el.updateComplete;

    const formHint = el.shadowRoot.querySelector('.ew-comment-form-hint');
    expect(formHint?.textContent.replace(/\s+/g, ' ').trim()).to.include('Or hit');
    expect(formHint?.textContent.replace(/\s+/g, ' ').trim()).to.include('to comment');
    expect(formHint?.textContent.replace(/\s+/g, ' ').trim()).to.not.include('to submit');
  });

  it('renders contextual shortcut copy for replies', async () => {
    const currentUser = { id: 'u1', name: 'Alice', email: 'a@b.com' };
    const thread = {
      id: 't1',
      body: 'Root comment',
      author: currentUser,
      createdAt: new Date().toISOString(),
      replies: [],
      isDetached: false,
      isResolved: false,
      resolved: false,
    };
    const ctrl = makeCtrl({
      selectedThreadId: 't1',
      getCurrentUser() { return currentUser; },
      getThreadGroups() { return { active: [thread], detached: [], resolved: [] }; },
    });

    el = await makeEl();
    el.controller = ctrl;
    await el.updateComplete;
    el.startReplyDraft(thread);
    await el.updateComplete;

    const formHint = el.shadowRoot.querySelector('.ew-comment-form-hint');
    expect(formHint?.textContent.replace(/\s+/g, ' ').trim()).to.include('Or hit');
    expect(formHint?.textContent.replace(/\s+/g, ' ').trim()).to.include('to reply');
    expect(formHint?.textContent.replace(/\s+/g, ' ').trim()).to.not.include('to submit');
  });

  it('allows shared hints to grow and adds extra top padding to the comments hint', async () => {
    el = await makeEl();
    el.controller = makeCtrl();
    await el.updateComplete;

    const rules = [...el.shadowRoot.adoptedStyleSheets]
      .flatMap((sheet) => [...sheet.cssRules]);
    const sharedHintRule = rules.find((rule) => rule.selectorText === '.da-hint');
    const commentsHintRule = rules.find((rule) => rule.selectorText === '.ew-comments-list > .da-hint');

    expect(sharedHintRule?.style.minHeight).to.equal('24px');
    expect(sharedHintRule?.style.height).to.equal('');
    expect(commentsHintRule?.style.paddingTop).to.not.equal('');
  });
});
