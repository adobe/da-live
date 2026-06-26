import { expect } from '@esm-bundle/chai';
import { createCommentsController } from '../../../../../blocks/canvas/ew-comments/helpers/controller.js';
import commentPlugin, { commentPluginKey } from '../../../../../blocks/canvas/ew-comments/comment-plugin.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

function makeStore(initial = []) {
  const map = new Map(initial);
  const observers = new Set();
  return {
    get(id) { return map.get(id); },
    set(id, v) {
      map.set(id, v);
      observers.forEach((fn) => fn());
      return Promise.resolve();
    },
    delete(id) {
      map.delete(id);
      observers.forEach((fn) => fn());
      return Promise.resolve();
    },
    forEach(fn) { map.forEach((v, id) => fn(v, id, this)); },
    deleteBatch(ids) {
      ids.forEach((id) => { map.delete(id); });
      observers.forEach((fn) => fn());
      return Promise.resolve();
    },
    observe(fn) { observers.add(fn); },
    unobserve(fn) { observers.delete(fn); },
    load() { return Promise.resolve(); },
    refresh() { return Promise.resolve(); },
    get size() { return map.size; },
  };
}

function makeAwareness(clientID = 1) {
  const states = new Map([[clientID, {}]]);
  const handlers = new Map();
  return {
    clientID,
    getStates() { return states; },
    setLocalStateField(key, value) {
      states.set(clientID, { ...states.get(clientID), [key]: value });
      const updateHandlers = handlers.get('update');
      updateHandlers?.forEach((fn) => fn({ added: [], updated: [clientID], removed: [] }));
    },
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
    },
    off(event, fn) { handlers.get(event)?.delete(fn); },
    simulateRemote(remoteId, fields) {
      states.set(remoteId, { ...(states.get(remoteId) ?? {}), ...fields });
      const updateHandlers = handlers.get('update');
      updateHandlers?.forEach((fn) => fn({ added: [remoteId], updated: [remoteId], removed: [] }));
    },
  };
}

async function createControllerWithPlugin() {
  const store = makeStore();
  const controller = createCommentsController({ commentsStore: store, wsProvider: null });
  const plugin = commentPlugin({ controller, store });
  const editor = await createTestEditor({ additionalPlugins: [plugin] });
  controller.bindView(editor.view);
  return { controller, editor, store };
}

describe('comments helpers/controller', () => {
  let store;
  let controller;

  beforeEach(() => {
    store = makeStore();
    controller = createCommentsController({ commentsStore: store, wsProvider: null });
  });

  afterEach(() => {
    controller.destroy();
  });

  it('does not expose the store directly', () => {
    expect(controller.store).to.be.undefined;
  });

  it('starts with empty UI state', () => {
    expect(controller.panelOpen).to.be.false;
    expect(controller.selectedThreadId).to.be.null;
    expect(controller.pendingAnchor).to.be.null;
    expect(controller.hasSelection).to.be.false;
    expect(controller.getAttachedThreadIds()).to.be.null;
  });

  it('reports zero counts when store is empty', () => {
    expect(controller.counts.active).to.equal(0);
    expect(controller.counts.resolved).to.equal(0);
  });

  it('recomputes counts on store set', () => {
    store.set('a', { id: 'a', resolved: false });
    store.set('b', { id: 'b', resolved: true });
    store.set('c', { id: 'c', threadId: 'a', resolved: false });
    expect(controller.counts.active).to.equal(1);
    expect(controller.counts.resolved).to.equal(1);
  });

  it('delivers per-reason events only to matching subscribers', async () => {
    const { controller: c, editor } = await createControllerWithPlugin();
    let panelOpenHits = 0;
    let selectedHits = 0;
    c.on('panelOpen', () => { panelOpenHits += 1; });
    c.on('selectedThreadId', () => { selectedHits += 1; });
    c.setPanelOpen(true);
    c.setSelectedThread('x');
    expect(panelOpenHits).to.equal(1);
    expect(selectedHits).to.equal(1);
    destroyEditor(editor);
    c.destroy();
  });

  it('openPanel bundles panelOpen+pendingAnchor', async () => {
    const { controller: c, editor } = await createControllerWithPlugin();
    c.openPanel({ pendingAnchor: { anchorType: 'text' } });
    expect(c.panelOpen).to.be.true;
    expect(c.pendingAnchor.anchorType).to.equal('text');
    destroyEditor(editor);
    c.destroy();
  });

  it('requestCompose is a no-op before bindView', () => {
    expect(controller.panelOpen).to.be.false;
    controller.requestCompose();
    expect(controller.panelOpen).to.be.false;
  });

  it('bindView with plugin deduplicates setSelectedThread dispatches', async () => {
    let dispatched = 0;
    const { controller: c, editor } = await createControllerWithPlugin();
    const orig = editor.view.dispatch.bind(editor.view);
    editor.view.dispatch = (tr) => {
      if (tr.getMeta(commentPluginKey)) dispatched += 1;
      return orig(tr);
    };
    c.setSelectedThread('x');
    c.setSelectedThread('x');
    expect(dispatched).to.equal(1);
    destroyEditor(editor);
    c.destroy();
  });

  it('notifies subscribers with reason when state changes', async () => {
    const { controller: c, editor } = await createControllerWithPlugin();
    const reasons = [];
    const unsub = c.subscribe(({ reason }) => reasons.push(reason));
    c.setPanelOpen(true);
    c.setSelectedThread('t1');
    c.setPendingAnchor({ anchorFrom: 'a', anchorTo: 'b', anchorType: 'text', anchorText: 'hi' });
    c.clearPendingAnchor();
    unsub();
    expect(reasons).to.include.members(['init', 'panelOpen', 'selectedThreadId', 'pendingAnchor']);
    expect(reasons, 'resolvedRanges is no longer emitted').to.not.include('resolvedRanges');
    destroyEditor(editor);
    c.destroy();
  });

  it('deduplicates hasSelection notifications', () => {
    const calls = [];
    controller.subscribe(({ reason }) => calls.push(reason));

    controller.setHasSelection(true);
    controller.setHasSelection(true);

    expect(controller.hasSelection).to.be.true;
    expect(calls.filter((r) => r === 'hasSelection')).to.have.length(1);
  });

  it('closePanel clears selectedThreadId and pendingAnchor', async () => {
    const { controller: c, editor } = await createControllerWithPlugin();
    c.setPanelOpen(true);
    c.setSelectedThread('t1');
    c.setPendingAnchor({ anchorFrom: 'a', anchorTo: 'b', anchorType: 'text', anchorText: 'hi' });
    c.closePanel();
    expect(c.selectedThreadId).to.be.null;
    expect(c.pendingAnchor).to.be.null;
    destroyEditor(editor);
    c.destroy();
  });

  it('getAttachedThreadIds returns null before a view is bound', () => {
    expect(controller.getAttachedThreadIds()).to.be.null;
  });

  it('getAttachedThreadIds returns the set of root threads whose anchors decode', async () => {
    const { controller: c, editor, store: m } = await createControllerWithPlugin();
    editor.view.dispatch(editor.view.state.tr.insertText('hello world'));

    const { encodeAnchor } = await import('../../../../../blocks/canvas/ew-comments/helpers/anchor.js');
    const encoded = encodeAnchor({
      selectionData: { from: 1, to: 6, anchorType: 'text', anchorText: 'hello' },
      state: editor.view.state,
    });

    m.set('t1', {
      id: 't1',
      ...encoded,
      author: { id: 'u' },
      body: '',
      createdAt: 0,
      resolved: false,
    });
    m.set('t2', {
      id: 't2',
      anchorFrom: [0, 255, 255, 255, 127, 0],
      anchorTo: [0, 255, 255, 255, 127, 6],
      anchorType: 'text',
      anchorText: 'missing',
      author: { id: 'u' },
      body: '',
      createdAt: 0,
      resolved: false,
    });
    m.set('t3', {
      id: 't3',
      ...encoded,
      author: { id: 'u' },
      body: '',
      createdAt: 0,
      resolved: true,
    });
    m.set('r1', {
      id: 'r1',
      threadId: 't1',
      author: { id: 'u' },
      body: 'reply',
      createdAt: 0,
    });

    const attached = c.getAttachedThreadIds();
    expect(attached).to.be.instanceOf(Set);
    expect(attached.has('t1')).to.be.true;
    expect(attached.has('t2'), 'bogus anchor is not attached').to.be.false;
    expect(attached.has('t3'), 'resolved threads are not attached').to.be.false;
    expect(attached.has('r1'), 'replies are not attached').to.be.false;
    destroyEditor(editor);
    c.destroy();
  });

  it('notifyDocChange emits on the docChange channel', () => {
    const hits = [];
    controller.on('docChange', () => hits.push(1));
    controller.notifyDocChange();
    controller.notifyDocChange();
    expect(hits).to.have.length(2);
  });

  describe('mutations', () => {
    it('createRootComment writes a root with anchor and defaults', async () => {
      const user = { id: 'u1', name: 'Alice' };
      const anchor = { anchorFrom: [1], anchorTo: [2], anchorType: 'text', anchorText: 'hi' };
      const id = await controller.createRootComment({ user, anchor, body: 'hello' });
      const stored = store.get(id);
      expect(stored.threadId).to.be.null;
      expect(stored.body).to.equal('hello');
      expect(stored.resolved).to.be.false;
      expect(stored.anchorFrom).to.deep.equal([1]);
    });

    it('createReply stores threadId', async () => {
      store.set('t1', { id: 't1' });
      const id = await controller.createReply({ threadId: 't1', user: { id: 'u' }, body: 'r' });
      const stored = store.get(id);
      expect(stored.threadId).to.equal('t1');
    });

    it('resolveThread / unresolveThread record resolvedBy and reopenedBy', () => {
      store.set('t', { id: 't', resolved: false });
      controller.resolveThread({ threadId: 't', user: { id: 'u1', name: 'Alice' } });
      let entry = store.get('t');
      expect(entry.resolved).to.be.true;
      expect(entry.resolvedBy).to.deep.equal({ id: 'u1', name: 'Alice' });
      expect(entry.reopenedBy).to.be.null;

      controller.unresolveThread({ threadId: 't', user: { id: 'u2', name: 'Bob' } });
      entry = store.get('t');
      expect(entry.resolved).to.be.false;
      expect(entry.resolvedBy).to.be.null;
      expect(entry.reopenedBy).to.deep.equal({ id: 'u2', name: 'Bob' });
    });

    it('deleteComment on a root cascades to replies', () => {
      store.set('r', { id: 'r' });
      store.set('c1', { id: 'c1', threadId: 'r' });
      store.set('c2', { id: 'c2', threadId: 'r' });
      controller.deleteComment({ commentId: 'r' });
      expect(store.size).to.equal(0);
    });

    it('deleteComment on a reply does not cascade', () => {
      store.set('r', { id: 'r' });
      store.set('c1', { id: 'c1', threadId: 'r' });
      controller.deleteComment({ commentId: 'c1' });
      expect(store.get('r')).to.exist;
      expect(store.get('c1')).to.be.undefined;
    });

    it('deleteComment awaits all reply deletes before deleting root', async () => {
      const deleteOrder = [];
      const testStore = makeStore([
        ['root', { id: 'root', resolved: false }],
        ['r1', { id: 'r1', threadId: 'root' }],
        ['r2', { id: 'r2', threadId: 'root' }],
      ]);
      testStore.deleteBatch = (ids) => {
        ids.forEach((id) => deleteOrder.push(id));
        return Promise.resolve();
      };
      const ctrl = createCommentsController({ commentsStore: testStore, wsProvider: null });

      await ctrl.deleteComment({ commentId: 'root' });

      expect(deleteOrder.indexOf('root')).to.be.greaterThan(deleteOrder.indexOf('r1'));
      expect(deleteOrder.indexOf('root')).to.be.greaterThan(deleteOrder.indexOf('r2'));
      ctrl.destroy();
    });
  });

  describe('queries', () => {
    it('findThreadForComment returns the threadId of a comment', () => {
      store.set('t1', { id: 't1' });
      store.set('r1', { id: 'r1', threadId: 't1' });
      expect(controller.findThreadForComment('r1')).to.equal('t1');
      expect(controller.findThreadForComment('missing')).to.be.null;
    });

    it('getThreadGroups splits roots into active / detached / resolved', () => {
      store.set('active', { id: 'active', resolved: false, createdAt: 2 });
      store.set('detached', { id: 'detached', resolved: false, createdAt: 1 });
      store.set('resolved', { id: 'resolved', resolved: true, resolvedAt: 5 });
      store.set('reply', { id: 'reply', threadId: 'active', createdAt: 3 });

      const groups = controller.getThreadGroups(new Set(['active']));
      expect(groups.active.map((t) => t.id)).to.deep.equal(['active']);
      expect(groups.detached.map((t) => t.id)).to.deep.equal(['detached']);
      expect(groups.resolved.map((t) => t.id)).to.deep.equal(['resolved']);
      expect(groups.active[0].replies.map((r) => r.id)).to.deep.equal(['reply']);
    });

    it('getThreadGroups treats null attachedIds as "all attached"', () => {
      store.set('a', { id: 'a', resolved: false, createdAt: 1 });
      const groups = controller.getThreadGroups(null);
      expect(groups.active.map((t) => t.id)).to.deep.equal(['a']);
      expect(groups.detached).to.have.length(0);
    });
  });
});

describe('comments helpers/controller — awareness sync', () => {
  it('calls store.refresh when a remote client comments.version changes', () => {
    let refreshCount = 0;
    const testStore = makeStore();
    testStore.refresh = () => {
      refreshCount += 1;
      return Promise.resolve();
    };
    const awareness = makeAwareness(1);
    const controller = createCommentsController({
      commentsStore: testStore,
      wsProvider: { awareness },
    });

    awareness.simulateRemote(2, { comments: { version: Date.now() } });

    expect(refreshCount).to.equal(1);
    controller.destroy();
  });

  it('does not call store.refresh for own client awareness updates', () => {
    let refreshCount = 0;
    const testStore = makeStore();
    testStore.refresh = () => {
      refreshCount += 1;
      return Promise.resolve();
    };
    const awareness = makeAwareness(1);
    const controller = createCommentsController({
      commentsStore: testStore,
      wsProvider: { awareness },
    });

    awareness.setLocalStateField('cursor', { x: 10 });

    expect(refreshCount).to.equal(0);
    controller.destroy();
  });

  it('does not call store.refresh for cursor-only remote update (no comments.version)', () => {
    let refreshCount = 0;
    const testStore = makeStore();
    testStore.refresh = () => {
      refreshCount += 1;
      return Promise.resolve();
    };
    const awareness = makeAwareness(1);
    const controller = createCommentsController({
      commentsStore: testStore,
      wsProvider: { awareness },
    });

    awareness.simulateRemote(2, { cursor: { x: 5 } });

    expect(refreshCount).to.equal(0);
    controller.destroy();
  });

  it('does not call store.refresh when remote comments.version has not changed', () => {
    let refreshCount = 0;
    const testStore = makeStore();
    testStore.refresh = () => {
      refreshCount += 1;
      return Promise.resolve();
    };
    const awareness = makeAwareness(1);
    const controller = createCommentsController({
      commentsStore: testStore,
      wsProvider: { awareness },
    });

    const version = Date.now();
    awareness.simulateRemote(2, { comments: { version } });
    expect(refreshCount).to.equal(1);

    awareness.simulateRemote(2, { cursor: { x: 1 } });
    expect(refreshCount).to.equal(1);
    controller.destroy();
  });

  it('broadcasts comments.version after createRootComment', async () => {
    const testStore = makeStore();
    const awareness = makeAwareness(1);
    const controller = createCommentsController({
      commentsStore: testStore,
      wsProvider: { awareness },
    });

    controller.createRootComment({ user: { id: 'u1', name: 'Alice' }, anchor: {}, body: 'hi' });
    await Promise.resolve();

    expect(awareness.getStates().get(1).comments.version).to.be.a('number');
    controller.destroy();
  });

  it('destroy unregisters the awareness handler', () => {
    let refreshCount = 0;
    const testStore = makeStore();
    testStore.refresh = () => {
      refreshCount += 1;
      return Promise.resolve();
    };
    const awareness = makeAwareness(1);
    const controller = createCommentsController({
      commentsStore: testStore,
      wsProvider: { awareness },
    });

    controller.destroy();
    awareness.simulateRemote(2, { comments: { version: Date.now() } });

    expect(refreshCount).to.equal(0);
  });
});
