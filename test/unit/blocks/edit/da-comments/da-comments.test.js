import { expect } from '@esm-bundle/chai';
import { Y } from 'da-y-wrapper';
import '../../../../../blocks/edit/da-comments/da-comments.js';

async function makeEl() {
  const el = document.createElement('da-comments');
  document.body.append(el);
  await el.updateComplete;
  return el;
}

function makeCtrl(overrides = {}) {
  const ydoc = new Y.Doc();
  return {
    ymap: ydoc.getMap('comments'),
    pendingAnchor: null,
    selectedThreadId: null,
    panelOpen: true,
    counts: { active: 0, resolved: 0 },
    hasSelection: false,
    getAttachedThreadIds() { return new Set(); },
    subscribe(fn) { fn({ reason: 'init' }); return () => {}; },
    closePanel() { this.panelOpen = false; },
    clearPendingAnchor() { this.pendingAnchor = null; },
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

  it('writes a flat root comment to ymap on submitDraft', async () => {
    let selectedId = null;
    const ctrl = makeCtrl({
      pendingAnchor: { anchorFrom: [1], anchorTo: [2], anchorType: 'text', anchorText: 'hi' },
      setSelectedThread(id) { selectedId = id; },
    });

    el = await makeEl();
    el.controller = ctrl;
    el.currentUser = { id: 'u1', name: 'Alice', email: 'a@b.com' };
    await el.updateComplete;

    el._draft = { mode: 'new', anchorData: ctrl.pendingAnchor, text: 'My comment' };
    const event = { preventDefault() {} };
    el.submitDraft(event);

    expect(ctrl.ymap.size).to.equal(1);
    const [entry] = [...ctrl.ymap.values()];
    expect(entry.parentId).to.be.null;
    expect(entry.body).to.equal('My comment');
    expect(entry.anchorText).to.equal('hi');
    expect(entry.resolved).to.be.false;
    expect(entry.reactions).to.deep.equal({});
    expect(selectedId).to.equal(entry.id);
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
});
