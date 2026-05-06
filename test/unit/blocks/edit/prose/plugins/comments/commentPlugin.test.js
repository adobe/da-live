import { expect } from '@esm-bundle/chai';
import { Y } from 'da-y-wrapper';
import { createTestEditor, destroyEditor } from '../../test-helpers.js';
import { createCommentsController } from '../../../../../../../blocks/edit/prose/plugins/comments/helpers/controller.js';
import commentPlugin, { commentPluginKey } from '../../../../../../../blocks/edit/prose/plugins/comments/commentPlugin.js';
import { encodeAnchor } from '../../../../../../../blocks/edit/prose/plugins/comments/helpers/anchor.js';

describe('commentPlugin', () => {
  let editor;
  let controller;

  async function setup() {
    const ydoc = new Y.Doc();
    const ymap = ydoc.getMap('comments');
    controller = createCommentsController({ ymap, ydoc, wsProvider: null });
    editor = await createTestEditor({ additionalPlugins: [commentPlugin(controller)] });
    return { ymap };
  }

  afterEach(() => {
    if (editor) destroyEditor(editor);
    editor = null;
    controller = null;
  });

  it('starts with empty ranges and default flags', async () => {
    await setup();
    const state = commentPluginKey.getState(editor.view.state);
    expect(state.ranges).to.be.instanceOf(Map);
    expect(state.ranges.size).to.equal(0);
    expect(state.selectedThreadId).to.be.null;
    expect(state.panelOpen).to.be.false;
    expect(state.pendingAnchor).to.be.null;
  });

  it('applies SET_SELECTED_THREAD via meta', async () => {
    await setup();
    editor.view.dispatch(editor.view.state.tr.setMeta(commentPluginKey, {
      type: 'setSelectedThread',
      payload: 'abc',
    }));
    const state = commentPluginKey.getState(editor.view.state);
    expect(state.selectedThreadId).to.equal('abc');
  });

  it('does not rewrite ymap anchors when the local doc changes', async () => {
    const { ymap } = await setup();
    editor.view.dispatch(editor.view.state.tr.insertText('hello world'));
    const encoded = encodeAnchor({
      selectionData: { from: 1, to: 6, anchorType: 'text', anchorText: 'hello' },
      state: editor.view.state,
    });
    expect(encoded, 'encode precondition').to.exist;
    ymap.set('t1', {
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
    const before = JSON.stringify(ymap.get('t1'));
    editor.view.dispatch(editor.view.state.tr.insertText('abc'));
    const after = JSON.stringify(ymap.get('t1'));
    expect(after).to.equal(before);
  });

  it('controller.setSelectedThread dispatches exactly one meta', async () => {
    await setup();
    let metas = 0;
    const origDispatch = editor.view.dispatch.bind(editor.view);
    editor.view.dispatch = (tr) => {
      if (tr.getMeta(commentPluginKey)) metas += 1;
      return origDispatch(tr);
    };
    controller.setSelectedThread('t1');
    expect(metas).to.equal(1);
    expect(commentPluginKey.getState(editor.view.state).selectedThreadId).to.equal('t1');
    controller.setSelectedThread('t1');
    expect(metas).to.equal(1);
  });

  it('a click-origin change converges in one dispatch (no ping-pong)', async () => {
    const { ymap } = await setup();
    editor.view.dispatch(editor.view.state.tr.insertText('hello world'));
    const encoded = encodeAnchor({
      selectionData: { from: 1, to: 6, anchorType: 'text', anchorText: 'hello' },
      state: editor.view.state,
    });
    ymap.set('t1', {
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
    controller.setPanelOpen(true);
    let metas = 0;
    const origDispatch = editor.view.dispatch.bind(editor.view);
    editor.view.dispatch = (tr) => {
      if (tr.getMeta(commentPluginKey)) metas += 1;
      return origDispatch(tr);
    };
    controller.setSelectedThread('t1');
    expect(metas).to.equal(1);
    expect(controller.selectedThreadId).to.equal('t1');
    expect(commentPluginKey.getState(editor.view.state).selectedThreadId).to.equal('t1');
  });

  it('deletes-then-undo: anchor data survives in the ymap so undo can re-anchor', async () => {
    const { ymap } = await setup();
    editor.view.dispatch(editor.view.state.tr.insertText('hello world'));
    const encoded = encodeAnchor({
      selectionData: { from: 1, to: 6, anchorType: 'text', anchorText: 'hello' },
      state: editor.view.state,
    });
    ymap.set('t1', {
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

    editor.view.dispatch(editor.view.state.tr.delete(1, 6));

    const afterDelete = ymap.get('t1');
    expect(afterDelete.anchorFrom, 'anchor data preserved').to.not.be.null;
    expect(afterDelete.anchorTo, 'anchor data preserved').to.not.be.null;
  });

  it('leaves anchors alone when the doc did not change', async () => {
    const { ymap } = await setup();
    editor.view.dispatch(editor.view.state.tr.insertText('hello world'));
    const encoded = encodeAnchor({
      selectionData: { from: 1, to: 6, anchorType: 'text', anchorText: 'hello' },
      state: editor.view.state,
    });
    ymap.set('t1', {
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
    const before = JSON.stringify(ymap.get('t1'));
    controller.setSelectedThread('t1');
    expect(JSON.stringify(ymap.get('t1'))).to.equal(before);
  });

  it('decorations update after a ymap write without the controller pushing SET_RANGES', async () => {
    const { ymap } = await setup();
    editor.view.dispatch(editor.view.state.tr.insertText('hello world'));
    const encoded = encodeAnchor({
      selectionData: { from: 1, to: 6, anchorType: 'text', anchorText: 'hello' },
      state: editor.view.state,
    });
    controller.setPanelOpen(true);

    expect(editor.view.dom.querySelector('[data-comment-thread]')).to.be.null;

    ymap.set('t1', {
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

    await new Promise((resolve) => { setTimeout(resolve, 0); });
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(editor.view.dom.querySelector('[data-comment-thread="t1"]'), 'decoration present').to.not.be.null;
  });

  it('view.update notifies the controller of doc changes via docChange', async () => {
    await setup();
    let docChangeHits = 0;
    controller.on('docChange', () => { docChangeHits += 1; });

    editor.view.dispatch(editor.view.state.tr.insertText('x'));
    expect(docChangeHits).to.equal(1);

    editor.view.dispatch(editor.view.state.tr.insertText('y'));
    expect(docChangeHits).to.equal(2);
  });

  it('rescues an anchor when a paragraph split tombstones the anchored yjs content', async () => {
    const { ymap } = await setup();

    editor.view.dispatch(editor.view.state.tr.insertText('Body carajillo, mug fair trade flavour'));

    const mugFrom = 17;
    const mugTo = 20;
    expect(editor.view.state.doc.textBetween(mugFrom, mugTo)).to.equal('mug');

    const encoded = encodeAnchor({
      selectionData: { from: mugFrom, to: mugTo, anchorType: 'text', anchorText: 'mug' },
      state: editor.view.state,
    });
    expect(encoded, 'encode precondition').to.exist;
    ymap.set('t1', {
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
    controller.setPanelOpen(true);

    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const initial = commentPluginKey.getState(editor.view.state).ranges.get('t1');
    expect(initial, 'range present before split').to.deep.include({ from: mugFrom, to: mugTo });

    const originalAnchorFrom = [...ymap.get('t1').anchorFrom];
    const originalAnchorTo = [...ymap.get('t1').anchorTo];

    editor.view.dispatch(editor.view.state.tr.split(mugFrom));

    const after = commentPluginKey.getState(editor.view.state).ranges.get('t1');
    expect(after, 'range rescued to new PM position after split').to.deep.include({
      from: mugFrom + 2,
      to: mugTo + 2,
    });

    const rescued = ymap.get('t1');
    expect(rescued.anchorText, 'anchor text preserved').to.equal('mug');
    expect(rescued.anchorFrom, 'yjs anchor re-encoded').to.not.deep.equal(originalAnchorFrom);
    expect(rescued.anchorTo, 'yjs anchor re-encoded').to.not.deep.equal(originalAnchorTo);
  });

  it('rescues multiple anchors tombstoned by a single paragraph split', async () => {
    const { ymap } = await setup();

    editor.view.dispatch(editor.view.state.tr.insertText('Body carajillo, mug fair trade flavour'));

    const mugFrom = 17;
    const mugTo = 20;
    const fairFrom = 21;
    const fairTo = 25;
    expect(editor.view.state.doc.textBetween(mugFrom, mugTo)).to.equal('mug');
    expect(editor.view.state.doc.textBetween(fairFrom, fairTo)).to.equal('fair');

    const anchor = (range, text) => encodeAnchor({
      selectionData: { from: range[0], to: range[1], anchorType: 'text', anchorText: text },
      state: editor.view.state,
    });
    const thread = (id, encoded) => ({
      id,
      threadId: id,
      parentId: null,
      ...encoded,
      author: { id: 'u' },
      body: '',
      createdAt: 0,
      resolved: false,
      reactions: {},
    });
    ymap.set('t1', thread('t1', anchor([mugFrom, mugTo], 'mug')));
    ymap.set('t2', thread('t2', anchor([fairFrom, fairTo], 'fair')));
    controller.setPanelOpen(true);

    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const originalMug = [...ymap.get('t1').anchorFrom];
    const originalFair = [...ymap.get('t2').anchorFrom];

    editor.view.dispatch(editor.view.state.tr.split(mugFrom));

    const pluginRanges = commentPluginKey.getState(editor.view.state).ranges;
    expect(pluginRanges.get('t1'), 'mug rescued').to.deep.include({
      from: mugFrom + 2,
      to: mugTo + 2,
    });
    expect(pluginRanges.get('t2'), 'fair rescued').to.deep.include({
      from: fairFrom + 2,
      to: fairTo + 2,
    });
    expect(ymap.get('t1').anchorFrom, 'mug ymap anchor re-encoded').to.not.deep.equal(originalMug);
    expect(ymap.get('t2').anchorFrom, 'fair ymap anchor re-encoded').to.not.deep.equal(originalFair);
  });

  it('does not rescue when the mapped range no longer matches the original anchorText', async () => {
    const { ymap } = await setup();

    editor.view.dispatch(editor.view.state.tr.insertText('hello world'));

    const encoded = encodeAnchor({
      selectionData: { from: 1, to: 6, anchorType: 'text', anchorText: 'hello' },
      state: editor.view.state,
    });
    ymap.set('t1', {
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
    controller.setPanelOpen(true);

    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const beforeAnchor = [...ymap.get('t1').anchorFrom];

    editor.view.dispatch(editor.view.state.tr.delete(1, 6));

    expect(ymap.get('t1').anchorFrom, 'ymap anchor untouched when text absent').to.deep.equal(beforeAnchor);
  });

  it('decorations track anchor positions across edits in earlier blocks', async () => {
    const { ymap } = await setup();

    const { schema, tr: tr0 } = editor.view.state;
    const para1 = schema.node('paragraph', null, schema.text('abc'));
    const para2 = schema.node('paragraph', null, schema.text('def'));
    editor.view.dispatch(tr0.replaceWith(0, editor.view.state.doc.content.size, [para1, para2]));

    const docStart = editor.view.state.doc;
    const para2Start = docStart.nodeSize - 5;
    const fromInDef = para2Start;
    const toInDef = para2Start + 3;

    const encoded = encodeAnchor({
      selectionData: { from: fromInDef, to: toInDef, anchorType: 'text', anchorText: 'def' },
      state: editor.view.state,
    });
    expect(encoded, 'encode precondition').to.exist;
    ymap.set('t1', {
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
    controller.setPanelOpen(true);

    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const initial = commentPluginKey.getState(editor.view.state).ranges.get('t1');
    expect(initial, 'initial decoration range').to.deep.include({ from: fromInDef, to: toInDef });

    editor.view.dispatch(editor.view.state.tr.insertText('X', 1));

    const after = commentPluginKey.getState(editor.view.state).ranges.get('t1');
    expect(after, 'range shifted by +1 after inserting one char in para 1').to.deep.include({
      from: fromInDef + 1,
      to: toInDef + 1,
    });
  });
});
