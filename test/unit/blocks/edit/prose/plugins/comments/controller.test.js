import { expect } from '@esm-bundle/chai';
import { Y } from 'da-y-wrapper';
import { createCommentsController } from '../../../../../../../blocks/edit/prose/plugins/comments/helpers/controller.js';
import commentPlugin, { commentPluginKey } from '../../../../../../../blocks/edit/prose/plugins/comments/commentPlugin.js';
import { createTestEditor, destroyEditor } from '../../test-helpers.js';

async function createControllerWithPlugin() {
  const ydoc = new Y.Doc();
  const ymap = ydoc.getMap('comments');
  const controller = createCommentsController({ ymap, ydoc, wsProvider: null });
  const editor = await createTestEditor({ additionalPlugins: [commentPlugin(controller)] });
  controller.bindView(editor.view);
  return { controller, editor, ydoc, ymap };
}

describe('comments helpers/controller', () => {
  let ydoc;
  let ymap;
  let controller;

  beforeEach(() => {
    ydoc = new Y.Doc();
    ymap = ydoc.getMap('comments');
    controller = createCommentsController({ ymap, ydoc, wsProvider: null });
  });

  afterEach(() => {
    controller.destroy();
  });

  it('exposes ymap and ydoc', () => {
    expect(controller.ymap).to.equal(ymap);
    expect(controller.ydoc).to.equal(ydoc);
  });

  it('starts with empty UI state', () => {
    expect(controller.panelOpen).to.be.false;
    expect(controller.selectedThreadId).to.be.null;
    expect(controller.pendingAnchor).to.be.null;
    expect(controller.hasSelection).to.be.false;
    expect(controller.getAttachedThreadIds()).to.be.null;
  });

  it('reports zero counts when ymap is empty', () => {
    expect(controller.counts.active).to.equal(0);
    expect(controller.counts.resolved).to.equal(0);
  });

  it('recomputes counts on ymap set', () => {
    ymap.set('a', { id: 'a', parentId: null, resolved: false });
    ymap.set('b', { id: 'b', parentId: null, resolved: true });
    ymap.set('c', { id: 'c', parentId: 'a', resolved: false });
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

  it('closing the panel clears selectedThreadId and pendingAnchor', async () => {
    const { controller: c, editor } = await createControllerWithPlugin();
    c.setPanelOpen(true);
    c.setSelectedThread('t1');
    c.setPendingAnchor({ anchorFrom: 'a', anchorTo: 'b', anchorType: 'text', anchorText: 'hi' });
    c.setPanelOpen(false);
    expect(c.selectedThreadId).to.be.null;
    expect(c.pendingAnchor).to.be.null;
    destroyEditor(editor);
    c.destroy();
  });

  /*
   * On cold page load, the server's initial snapshot mutates both the
   * XmlFragment and the comments ymap in a single Yjs transaction. Attaching
   * the observer only after wsProvider.synced avoids firing before
   * y-prosemirror has populated binding.mapping (which would crash
   * decodeAnchor on `undefined.nodeSize`).
   */
  it('defers attaching the ymap observer until wsProvider is synced', () => {
    const listeners = new Map();
    const mockProvider = {
      synced: false,
      on(evt, cb) {
        if (!listeners.has(evt)) listeners.set(evt, new Set());
        listeners.get(evt).add(cb);
      },
      off(evt, cb) { listeners.get(evt)?.delete(cb); },
    };
    const gatedYdoc = new Y.Doc();
    const gatedYmap = gatedYdoc.getMap('comments');
    const gated = createCommentsController({
      ymap: gatedYmap,
      ydoc: gatedYdoc,
      wsProvider: mockProvider,
    });

    let countsHits = 0;
    gated.on('counts', () => { countsHits += 1; });

    gatedYmap.set('pre', { id: 'pre', parentId: null, resolved: false });
    expect(countsHits, 'observer is inert before sync').to.equal(0);

    mockProvider.synced = true;
    listeners.get('synced')?.forEach((cb) => cb(true));

    expect(countsHits, 'prime emits once after sync').to.equal(1);
    expect(gated.counts.active).to.equal(1);

    gatedYmap.set('post', { id: 'post', parentId: null, resolved: false });
    expect(countsHits, 'observer attached after sync').to.equal(2);

    gated.destroy();
  });

  it('getAttachedThreadIds returns null before a view is bound', () => {
    expect(controller.getAttachedThreadIds()).to.be.null;
  });

  it('getAttachedThreadIds returns the set of root threads whose anchors decode', async () => {
    const { controller: c, editor, ymap: m } = await createControllerWithPlugin();
    editor.view.dispatch(editor.view.state.tr.insertText('hello world'));

    const { encodeAnchor } = await import('../../../../../../../blocks/edit/prose/plugins/comments/helpers/anchor.js');
    const encoded = encodeAnchor({
      selectionData: { from: 1, to: 6, anchorType: 'text', anchorText: 'hello' },
      state: editor.view.state,
    });

    m.set('t1', {
      id: 't1',
      threadId: 't1',
      parentId: null,
      ...encoded,
      author: { id: 'u' },
      body: '',
      createdAt: 0,
      resolved: false,
      reactions: {},
    });
    m.set('t2', {
      id: 't2',
      threadId: 't2',
      parentId: null,
      anchorFrom: [0, 255, 255, 255, 127, 0],
      anchorTo: [0, 255, 255, 255, 127, 6],
      anchorType: 'text',
      anchorText: 'missing',
      author: { id: 'u' },
      body: '',
      createdAt: 0,
      resolved: false,
      reactions: {},
    });
    m.set('t3', {
      id: 't3',
      threadId: 't3',
      parentId: null,
      ...encoded,
      author: { id: 'u' },
      body: '',
      createdAt: 0,
      resolved: true,
      reactions: {},
    });
    m.set('r1', {
      id: 'r1',
      threadId: 't1',
      parentId: 't1',
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

  it('removes the synced listener when destroyed before sync fires', () => {
    const listeners = new Map();
    const mockProvider = {
      synced: false,
      on(evt, cb) {
        if (!listeners.has(evt)) listeners.set(evt, new Set());
        listeners.get(evt).add(cb);
      },
      off(evt, cb) { listeners.get(evt)?.delete(cb); },
    };
    const gatedYdoc = new Y.Doc();
    const gated = createCommentsController({
      ymap: gatedYdoc.getMap('comments'),
      ydoc: gatedYdoc,
      wsProvider: mockProvider,
    });
    expect(listeners.get('synced')?.size).to.equal(1);
    gated.destroy();
    expect(listeners.get('synced')?.size).to.equal(0);
  });
});
