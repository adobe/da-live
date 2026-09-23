import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

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

    expect(listHint?.textContent.replace(/\s+/g, ' ').trim()).to.contain('Select content');
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

describe('ew-comments — suggestion cards', () => {
  let el;
  afterEach(() => {
    el?.remove();
    el = null;
    canvasBus.suggestionsState.emit({ items: [] });
  });

  const replace = {
    id: '7-22', from: 7, to: 22, kind: 'replace', deleted: 'ipsum', inserted: 'jsdfjsdfds', username: 'Usman Khalid', createdAt: 1700000000000,
  };

  const showing = async (items) => {
    el = await makeEl();
    el.controller = makeCtrl();
    await el.updateComplete;
    canvasBus.suggestionsState.emit({ items });
    await el.updateComplete;
    return el.shadowRoot.querySelector('.ew-suggestion-card');
  };

  it('renders a suggestion card in the list', async () => {
    const card = await showing([replace]);
    expect(card).to.exist;
    expect(card.dataset.suggestion).to.equal('7-22');
  });

  it('marks it clearly as a suggestion', async () => {
    const card = await showing([replace]);
    expect(card.querySelector('.ew-suggestion-badge').textContent.trim()).to.equal('Suggestion');
  });

  it('describes a replacement the way the author made it', async () => {
    const card = await showing([replace]);
    const text = card.querySelector('.ew-comment-content').textContent.replace(/\s+/g, ' ').trim();
    expect(text).to.equal('Replace: “ipsum” with “jsdfjsdfds”');
  });

  it('describes a deletion and an insertion', async () => {
    let card = await showing([{ ...replace, kind: 'delete', inserted: '' }]);
    expect(card.querySelector('.ew-comment-content').textContent.replace(/\s+/g, ' ').trim())
      .to.equal('Delete: “ipsum”');
    el.remove();

    card = await showing([{ ...replace, kind: 'insert', deleted: '' }]);
    expect(card.querySelector('.ew-comment-content').textContent.replace(/\s+/g, ' ').trim())
      .to.equal('Insert: “jsdfjsdfds”');
  });

  it('names the author', async () => {
    const card = await showing([replace]);
    expect(card.querySelector('.ew-comment-author').textContent.trim()).to.equal('Usman Khalid');
  });

  it('accepts via the checkmark', async () => {
    const card = await showing([replace]);
    let request = null;
    const off = canvasBus.suggestionResolveRequest.subscribe((d) => { request = d; });
    card.querySelector('[aria-label="Accept suggestion"]').click();
    off();
    expect(request).to.deep.equal({ from: 7, to: 22, action: 'accept' });
  });

  it('rejects via the close button', async () => {
    const card = await showing([replace]);
    let request = null;
    const off = canvasBus.suggestionResolveRequest.subscribe((d) => { request = d; });
    card.querySelector('[aria-label="Reject suggestion"]').click();
    off();
    expect(request.action).to.equal('reject');
  });

  it('scrolls to the suggestion when the card is clicked', async () => {
    let scrolledTo = null;
    el = await makeEl();
    el.controller = makeCtrl({ scrollToPos(pos) { scrolledTo = pos; } });
    await el.updateComplete;
    canvasBus.suggestionsState.emit({ items: [replace] });
    await el.updateComplete;
    el.shadowRoot.querySelector('.ew-suggestion-card').click();
    expect(scrolledTo).to.equal(7);
  });

  it('hides suggestions on the resolved tab', async () => {
    await showing([replace]);
    el._activeTab = 'resolved';
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.ew-suggestion-card')).to.be.null;
  });
});

describe('ew-comments — suggest toggle', () => {
  let el;
  // The tool panel asks the view for these and hosts them in its own header; the
  // toggle only fires change once it is actually in the document, so mount it too.
  let host;
  const actions = () => {
    const node = el.getHeaderActions();
    if (node.parentElement !== host) host.append(node);
    return node;
  };
  const toggle = () => actions().querySelector('input[type="checkbox"]');
  const hint = () => el.shadowRoot.querySelector('.da-hint').textContent.replace(/\s+/g, ' ').trim();

  const mounted = async ({ view = 'content' } = {}) => {
    host = document.createElement('div');
    document.body.append(host);
    el = await makeEl();
    el.controller = makeCtrl();
    canvasBus.editorViewState.emit({ view });
    await el.updateComplete;
    return el;
  };

  afterEach(() => {
    el?.remove();
    el = null;
    host?.remove();
    host = null;
    canvasBus.suggestModeState.emit({ on: false });
    canvasBus.editorViewState.emit({ view: 'content' });
  });

  it('is a labelled checkbox, not a dropdown', async () => {
    await mounted();
    expect(toggle()).to.exist;
    expect(actions().textContent.trim()).to.equal('Suggesting');
    expect(actions().querySelector('nx-picker')).to.be.null;
  });

  it('lives in the panel header, not the panel body', async () => {
    await mounted();
    expect(el.shadowRoot.querySelector('input[type="checkbox"]')).to.be.null;
    expect(actions().contains(toggle())).to.be.true;
  });

  it('starts off', async () => {
    await mounted();
    expect(toggle().checked).to.be.false;
  });

  it('requests the mode change when switched on', async () => {
    await mounted();
    let emitted = 0;
    const off = canvasBus.suggestModeRequest.subscribe(() => { emitted += 1; });
    toggle().click();
    off();
    expect(emitted).to.equal(1);
  });

  it('reflects the mode the editor reports', async () => {
    await mounted();
    canvasBus.suggestModeState.emit({ on: true });
    expect(toggle().checked).to.be.true;

    canvasBus.suggestModeState.emit({ on: false });
    expect(toggle().checked).to.be.false;
  });

  it('is hidden in layout mode, where suggesting is unavailable', async () => {
    await mounted({ view: 'layout' });
    expect(actions().hidden).to.be.true;
  });

  it('is shown again back in content mode', async () => {
    await mounted({ view: 'layout' });
    canvasBus.editorViewState.emit({ view: 'content' });
    expect(actions().hidden).to.be.false;
  });

  it('explains commenting while the toggle is off', async () => {
    await mounted();
    expect(hint()).to.contain('to add a comment');
  });

  it('explains suggesting while the toggle is on', async () => {
    await mounted();
    canvasBus.suggestModeState.emit({ on: true });
    await el.updateComplete;
    expect(hint()).to.contain('Your edits become suggestions.');
  });
});

describe('ew-comments — suggestion card accent', () => {
  let el;
  const base = {
    id: '7-22', from: 7, to: 22, deleted: 'ipsum', inserted: 'brave', username: 'Ada', createdAt: 1700000000000,
  };

  const cardFor = async (item, ctrl) => {
    el = await makeEl();
    el.controller = ctrl ?? makeCtrl();
    await el.updateComplete;
    canvasBus.suggestionsState.emit({ items: [item] });
    await el.updateComplete;
    return el.shadowRoot.querySelector('.ew-suggestion-card');
  };

  afterEach(() => {
    el?.remove();
    el = null;
    canvasBus.suggestionsState.emit({ items: [] });
  });

  it('accents by author, not by operation', async () => {
    const ctrl = makeCtrl({ authorColorSet: () => ({ strong: 'rgb(1, 2, 3)', bg: '#fff', text: '#000' }) });
    const card = await cardFor({ ...base, kind: 'delete', inserted: '' }, ctrl);
    expect(card.style.getPropertyValue('--ew-suggestion-accent')).to.equal('rgb(1, 2, 3)');
  });

  it('uses the same accent for a deletion and an insertion', async () => {
    const ctrl = makeCtrl({ authorColorSet: () => ({ strong: 'rgb(9, 9, 9)', bg: '#fff', text: '#000' }) });
    const del = await cardFor({ ...base, kind: 'delete', inserted: '' }, ctrl);
    const accent = del.style.getPropertyValue('--ew-suggestion-accent');
    el.remove();

    const ins = await cardFor({ ...base, kind: 'insert', deleted: '' }, ctrl);
    expect(ins.style.getPropertyValue('--ew-suggestion-accent')).to.equal(accent);
  });

  it('matches the avatar colour on the same card', async () => {
    const set = { strong: 'rgb(4, 5, 6)', bg: 'rgb(7, 8, 9)', text: '#000' };
    const card = await cardFor({ ...base, kind: 'replace' }, makeCtrl({ authorColorSet: () => set }));
    expect(card.style.getPropertyValue('--ew-suggestion-accent')).to.equal(set.strong);
    expect(card.querySelector('.ew-comment-avatar').style.backgroundColor).to.equal(set.bg);
  });
});

describe('ew-comments — resolved suggestions', () => {
  let el;
  const record = {
    id: 'r1',
    threadId: null,
    kind: 'suggestion',
    suggestion: { kind: 'delete', deleted: 'sadsad', inserted: '' },
    author: { name: 'Ada', id: 'Ada' },
    createdAt: 1700000000000,
    resolved: true,
    resolution: 'accepted',
    resolvedBy: { id: 'u1', name: 'Usman Khalid' },
    resolvedAt: 1700000100000,
  };

  const showResolved = async (entry) => {
    el = await makeEl();
    el.controller = makeCtrl({
      counts: { active: 0, resolved: 1 },
      getThreadGroups: () => ({
        active: [],
        detached: [],
        resolved: [{ ...entry, replies: [], isDetached: false, isResolved: true }],
      }),
    });
    await el.updateComplete;
    el._activeTab = 'resolved';
    await el.updateComplete;
    return el.shadowRoot.querySelector('.ew-suggestion-card');
  };

  afterEach(() => {
    el?.remove();
    el = null;
  });

  it('shows an accepted suggestion on the resolved tab', async () => {
    const card = await showResolved(record);
    expect(card).to.exist;
    expect(card.dataset.suggestionOutcome).to.equal('accepted');
  });

  it('says who accepted it', async () => {
    const card = await showResolved(record);
    const status = card.querySelector('.ew-comments-resolved-info').textContent
      .replace(/\s+/g, ' ').trim();
    expect(status).to.contain('Suggestion accepted by Usman Khalid');
  });

  it('says when it was rejected instead', async () => {
    const card = await showResolved({ ...record, resolution: 'rejected' });
    expect(card.dataset.suggestionOutcome).to.equal('rejected');
    expect(card.querySelector('.ew-comments-resolved-info').textContent)
      .to.contain('Suggestion rejected by');
  });

  it('still describes what the suggestion was', async () => {
    const card = await showResolved(record);
    expect(card.querySelector('.ew-comment-content').textContent.replace(/\s+/g, ' ').trim())
      .to.equal('Delete: “sadsad”');
  });

  it('is marked resolved so it is not actionable', async () => {
    const card = await showResolved(record);
    expect(card.classList.contains('is-resolved')).to.be.true;
    expect(card.querySelector('[aria-label="Accept suggestion"]')).to.be.null;
  });

  it('keeps the author accent', async () => {
    const set = { strong: 'rgb(1, 2, 3)', bg: '#fff', text: '#000' };
    el = await makeEl();
    el.controller = makeCtrl({
      authorColorSet: () => set,
      counts: { active: 0, resolved: 1 },
      getThreadGroups: () => ({
        active: [],
        detached: [],
        resolved: [{ ...record, replies: [], isResolved: true }],
      }),
    });
    await el.updateComplete;
    el._activeTab = 'resolved';
    await el.updateComplete;
    const card = el.shadowRoot.querySelector('.ew-suggestion-card');
    expect(card.style.getPropertyValue('--ew-suggestion-accent')).to.equal(set.strong);
  });
});
