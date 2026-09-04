/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { NodeSelection, TextSelection } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let createTrackingPlugin;
let updateDocument;

before(async () => {
  await import('../../../../../blocks/canvas/ew-editor-doc/ew-editor-doc.js');
  ({ createTrackingPlugin } = await import('../../../../../blocks/canvas/editor-utils/prose-diff.js'));
  ({ updateDocument } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js'));
});

// Wraps view.dispatch so tests can assert the guarded early-returns in
// _scrollDocToProseIndex skip dispatching, while still applying transactions that do.
function spyDispatch(view) {
  const calls = [];
  const original = view.dispatch.bind(view);
  view.dispatch = (tr) => {
    calls.push(tr);
    original(tr);
  };
  return calls;
}

// Replaces the default doc with a text paragraph + an image paragraph, mirroring a real page.
function buildDoc(view) {
  const { schema } = view.state;
  const textPara = schema.nodes.paragraph.create(null, schema.text('hello world'));
  const imagePara = schema.nodes.paragraph.create(null, schema.nodes.image.create({ src: '/x.png' }));
  const { content } = schema.nodes.doc.create(null, [textPara, imagePara]);
  view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, content));

  let imagePos = -1;
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'image') imagePos = pos;
  });
  return { imagePos };
}

// Mirrors blocks.test.js's tableJSON helper — a minimal authored block table.
function tableJSON(name, ...contentTexts) {
  const cell = (text) => ({
    type: 'table_cell',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
  return {
    type: 'table',
    content: [
      { type: 'table_row', content: [cell(name)] },
      ...contentTexts.map((text) => ({ type: 'table_row', content: [cell(text)] })),
    ],
  };
}

// Like buildDoc but a single block table; also returns a cell text position for tr.split.
function buildTableDoc(view) {
  const { schema } = view.state;
  const table = schema.nodeFromJSON(tableJSON('grid', 'content'));
  const { content } = schema.nodes.doc.create(null, [table]);
  view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, content));

  let tablePos = -1;
  let cellTextPos = -1;
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'table' && tablePos === -1) tablePos = pos;
    if (node.type.name === 'paragraph' && node.textContent === 'content') {
      cellTextPos = pos + 1 + Math.floor(node.textContent.length / 2);
    }
  });
  return { tablePos, cellTextPos };
}

describe('EwEditorDoc — _scrollDocToProseIndex', () => {
  let editor;
  let el;
  let imagePos;

  beforeEach(async () => {
    editor = await createTestEditor();
    ({ imagePos } = buildDoc(editor.view));
    el = document.createElement('ew-editor-doc');
  });

  afterEach(() => {
    destroyEditor(editor);
  });

  it('selects the image node with a NodeSelection and broadcasts when kind is image and the node at proseIndex is an image', () => {
    const dispatchCalls = spyDispatch(editor.view);
    const broadcastCalls = [];
    el._broadcastSelectedNode = (...args) => broadcastCalls.push(args);
    el._proseContext = { view: editor.view };

    el._scrollDocToProseIndex(imagePos, 'image');

    expect(dispatchCalls).to.have.lengthOf(1);
    expect(editor.view.state.selection).to.be.instanceOf(NodeSelection);
    expect(editor.view.state.selection.from).to.equal(imagePos);
    expect(broadcastCalls).to.deep.equal([[true]]);
  });

  it('selects the paragraph node with a NodeSelection and broadcasts the raw content anchor when proseIndex is one past the node start', () => {
    const dispatchCalls = spyDispatch(editor.view);
    const broadcastCalls = [];
    el._broadcastSelectedNode = (...args) => broadcastCalls.push(args);
    el._proseContext = { view: editor.view };

    // proseIndex 1 mirrors the real data-prose-index/posAtDOM convention: one position
    // inside the paragraph's own start (0), not the start itself.
    el._scrollDocToProseIndex(1, 'paragraph');

    expect(dispatchCalls).to.have.lengthOf(1);
    expect(editor.view.state.selection).to.be.instanceOf(NodeSelection);
    expect(editor.view.state.selection.from).to.equal(0);
    expect(broadcastCalls).to.deep.equal([[true, { anchorType: 'content', proseIndex: 1 }]]);
  });

  it('falls back to a TextSelection near proseIndex when it lands mid-node and broadcasts a content anchor', () => {
    const dispatchCalls = spyDispatch(editor.view);
    const broadcastCalls = [];
    el._broadcastSelectedNode = (...args) => broadcastCalls.push(args);
    el._proseContext = { view: editor.view };

    el._scrollDocToProseIndex(3, 'paragraph');

    expect(dispatchCalls).to.have.lengthOf(1);
    expect(editor.view.state.selection).to.be.instanceOf(TextSelection);
    expect(broadcastCalls).to.deep.equal([[true, { anchorType: 'content', proseIndex: 3 }]]);
  });

  describe('guards', () => {
    it('does nothing when proseIndex is null', () => {
      const dispatchCalls = spyDispatch(editor.view);
      el._proseContext = { view: editor.view };

      el._scrollDocToProseIndex(null, 'text');

      expect(dispatchCalls).to.have.lengthOf(0);
    });

    it('does nothing when proseIndex is negative', () => {
      const dispatchCalls = spyDispatch(editor.view);
      el._proseContext = { view: editor.view };

      el._scrollDocToProseIndex(-1, 'text');

      expect(dispatchCalls).to.have.lengthOf(0);
    });

    it('does nothing when proseIndex exceeds the document size', () => {
      const dispatchCalls = spyDispatch(editor.view);
      el._proseContext = { view: editor.view };

      el._scrollDocToProseIndex(editor.view.state.doc.content.size + 10, 'text');

      expect(dispatchCalls).to.have.lengthOf(0);
    });
  });
});

// Splitting a table-cell paragraph (e.g. Enter mid-cell) fails findCommonEditableAncestor
// and falls back to a full SET_BODY redecoration, which races the block-edit modal's
// live-editing of that same iframe DOM.
describe('EwEditorDoc — block-edit suppresses controller rerenders', () => {
  let editor;
  let el;
  let tablePos;
  let cellTextPos;
  let ctx;
  let postMessageCalls;

  beforeEach(async () => {
    postMessageCalls = [];
    ctx = { suppressRerender: false, port: { postMessage: (msg) => postMessageCalls.push(msg) } };

    const trackingPlugin = createTrackingPlugin(() => updateDocument(ctx));
    editor = await createTestEditor({ additionalPlugins: [trackingPlugin] });
    ctx.view = editor.view;
    ({ tablePos, cellTextPos } = buildTableDoc(editor.view));
    // Discard the setup dispatch's own trip through the tracking plugin.
    postMessageCalls.length = 0;

    el = document.createElement('ew-editor-doc');
    el._proseContext = { view: editor.view };
    el._controllerCtx = ctx;
  });

  afterEach(() => {
    destroyEditor(editor);
  });

  it('splitting a table-cell paragraph triggers a rerender outside block edit', () => {
    editor.view.dispatch(editor.view.state.tr.split(cellTextPos));

    expect(postMessageCalls).to.have.lengthOf(1);
  });

  it('suppresses that rerender for the duration of block edit, then flushes one on exit', () => {
    el.enterBlockEdit(tablePos);

    editor.view.dispatch(editor.view.state.tr.split(cellTextPos));
    expect(postMessageCalls).to.have.lengthOf(0);

    el.exitBlockEdit();
    expect(postMessageCalls).to.have.lengthOf(1);
  });
});

// Models SET_BODY's async cost: each postMessage opens a "redecoration in flight" that
// stays open until settleOldest(), so overlapping calls are directly observable.
function createFakeIframePort() {
  const calls = [];
  let active = 0;
  let maxActive = 0;
  return {
    calls,
    get active() { return active; },
    get maxActive() { return maxActive; },
    postMessage(msg) {
      calls.push(msg);
      active += 1;
      maxActive = Math.max(maxActive, active);
    },
    settleOldest() {
      active = Math.max(0, active - 1);
    },
    reset() {
      calls.length = 0;
      active = 0;
      maxActive = 0;
    },
  };
}

// Two independently-splittable cells, so two "Enter" edits can be simulated without
// reusing a position invalidated by the first split.
function buildTwoCellTableDoc(view) {
  const { schema } = view.state;
  const table = schema.nodeFromJSON(tableJSON('grid', 'first cell', 'second cell'));
  const { content } = schema.nodes.doc.create(null, [table]);
  view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, content));

  let tablePos = -1;
  const cellTextPos = {};
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'table' && tablePos === -1) tablePos = pos;
    if (node.type.name === 'paragraph' && node.textContent === 'first cell') {
      cellTextPos.first = pos + 1 + Math.floor(node.textContent.length / 2);
    }
    if (node.type.name === 'paragraph' && node.textContent === 'second cell') {
      cellTextPos.second = pos + 1 + Math.floor(node.textContent.length / 2);
    }
  });
  return { tablePos, cellTextPos };
}

describe('EwEditorDoc — block-edit prevents overlapping SET_BODY redecorations', () => {
  let editor;
  let el;
  let tablePos;
  let cellTextPos;
  let ctx;
  let port;

  beforeEach(async () => {
    port = createFakeIframePort();
    ctx = { suppressRerender: false, port };

    const trackingPlugin = createTrackingPlugin(() => updateDocument(ctx));
    editor = await createTestEditor({ additionalPlugins: [trackingPlugin] });
    ctx.view = editor.view;
    ({ tablePos, cellTextPos } = buildTwoCellTableDoc(editor.view));
    port.reset(); // discard the setup dispatch's own trip through the tracking plugin

    el = document.createElement('ew-editor-doc');
    el._proseContext = { view: editor.view };
    el._controllerCtx = ctx;
  });

  afterEach(() => {
    destroyEditor(editor);
  });

  it('two edits in quick succession overlap outside block edit', () => {
    editor.view.dispatch(editor.view.state.tr.split(cellTextPos.first));
    const activeAfterFirst = port.active;
    expect(activeAfterFirst).to.be.above(0, 'first edit should start a redecoration');

    // Yjs's sync plugin can echo more than one tracking-plugin trip per dispatch, so
    // assert on overlap growth rather than a pinned call count.
    editor.view.dispatch(editor.view.state.tr.split(cellTextPos.second));
    expect(port.active).to.be.above(activeAfterFirst, 'a second SET_BODY fired while the first was still in flight');
  });

  it('never starts a redecoration during block edit, so none can overlap', () => {
    el.enterBlockEdit(tablePos);

    editor.view.dispatch(editor.view.state.tr.split(cellTextPos.first));
    editor.view.dispatch(editor.view.state.tr.split(cellTextPos.second));
    expect(port.maxActive).to.equal(0, 'block edit must not start any redecoration at all');

    el.exitBlockEdit();
    expect(port.active).to.be.above(0, 'exiting flushes a redecoration, once it is safe');
  });
});
