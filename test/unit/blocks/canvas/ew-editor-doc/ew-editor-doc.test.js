/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { NodeSelection, TextSelection } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
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

describe('EwEditorDoc — _broadcastSelectedNode text-selection fallback (#1220)', () => {
  let editor;
  let el;
  let messages;
  let ctx;

  // Two plain paragraphs: "first" spans 0–7, "second" starts at 7.
  function setTextDoc(view) {
    const { schema } = view.state;
    const para = (text) => schema.nodes.paragraph.create(null, schema.text(text));
    const { content } = schema.nodes.doc.create(null, [para('first'), para('second')]);
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, content));
  }

  function setCursor(pos) {
    const { state } = editor.view;
    editor.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)));
  }

  beforeEach(async () => {
    editor = await createTestEditor();
    setTextDoc(editor.view);
    el = document.createElement('ew-editor-doc');
    messages = [];
    ctx = { port: { postMessage: (msg) => messages.push(msg) }, suppressRerender: false };
    el._proseContext = { view: editor.view };
    el._controllerCtx = ctx;
  });

  afterEach(() => {
    destroyEditor(editor);
  });

  it('scrolls the WYSIWYG to the content anchor of a doc-origin text cursor', () => {
    setCursor(3);
    el._broadcastSelectedNode(true);

    expect(messages).to.have.lengthOf(1);
    expect(messages[0].node).to.deep.equal({ anchorType: 'content', proseIndex: 1 });
    expect(messages[0].scrollIntoView).to.equal(true);
    expect(messages[0].payload).to.deep.equal({
      node: { anchorType: 'content', proseIndex: 1 },
      scrollIntoView: true,
    });
  });

  it('does not re-broadcast while the cursor stays in the same block, but does on a block change', () => {
    setCursor(2);
    el._broadcastSelectedNode(true);
    setCursor(4);
    el._broadcastSelectedNode(true);
    expect(messages).to.have.lengthOf(1);

    setCursor(10);
    el._broadcastSelectedNode(true);
    expect(messages).to.have.lengthOf(2);
    expect(messages[1].node).to.deep.equal({ anchorType: 'content', proseIndex: 8 });
    expect(messages[1].scrollIntoView).to.equal(true);
  });

  it('does not scroll the iframe back to a selection mirrored from the iframe itself', () => {
    setCursor(3);
    ctx.mirroringFromIframe = true;
    el._broadcastSelectedNode(true);

    expect(messages).to.have.lengthOf(1);
    expect(messages[0].node).to.equal(null);
    expect(messages[0].scrollIntoView).to.equal(false);
  });

  it('skips the scroll for a real dispatchMirror, then scrolls again for doc-origin moves', async () => {
    const { dispatchMirror } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js');
    destroyEditor(editor);
    const onSelection = () => el._broadcastSelectedNode(true);
    const trackingPlugin = createTrackingPlugin(null, null, null, onSelection);
    editor = await createTestEditor({ additionalPlugins: [trackingPlugin] });
    setTextDoc(editor.view);
    el._proseContext = { view: editor.view };
    messages.length = 0;
    el._lastBroadcastNodeKey = undefined;

    const { view } = editor;
    dispatchMirror(view, view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)), ctx);
    expect(messages.map((m) => m.scrollIntoView)).to.deep.equal([false]);
    expect(ctx.mirroringFromIframe).to.equal(false);

    setCursor(10);
    expect(messages).to.have.lengthOf(2);
    expect(messages[1].scrollIntoView).to.equal(true);
  });

  describe('selections inside a block (table)', () => {
    let tableStarts;

    // intro paragraph, table A (two cells), table B (one cell).
    function setTableDoc(view) {
      const { schema } = view.state;
      const para = (text) => schema.nodes.paragraph.create(null, schema.text(text));
      const cell = (text) => schema.nodes.table_cell.create(null, para(text));
      const table = (...texts) => schema.nodes.table.create(
        null,
        schema.nodes.table_row.create(null, texts.map(cell)),
      );
      const { content } = schema.nodes.doc.create(null, [
        para('intro'), table('a1', 'a2'), table('b1'),
      ]);
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, content));
      tableStarts = [];
      view.state.doc.forEach((node, offset) => {
        if (node.type.name === 'table') tableStarts.push(offset);
      });
    }

    function posInText(text) {
      let found;
      editor.view.state.doc.descendants((node, pos) => {
        if (found === undefined && node.isText && node.text === text) found = pos + 1;
      });
      return found;
    }

    beforeEach(() => {
      setTableDoc(editor.view);
    });

    it('broadcasts the whole-table anchor with scrollIntoView for a cursor in a cell', () => {
      setCursor(posInText('a1'));
      el._broadcastSelectedNode(true);

      expect(messages).to.have.lengthOf(1);
      const node = { anchorType: 'table', proseIndex: tableStarts[0] + 1 };
      expect(messages[0].node).to.deep.equal(node);
      expect(messages[0].scrollIntoView).to.equal(true);
      expect(messages[0].payload).to.deep.equal({ node, scrollIntoView: true });
    });

    it('does not re-broadcast when moving between cells of the same table', () => {
      setCursor(posInText('a1'));
      el._broadcastSelectedNode(true);
      setCursor(posInText('a2'));
      el._broadcastSelectedNode(true);

      expect(messages).to.have.lengthOf(1);
    });

    it('re-broadcasts when moving to a different block', () => {
      setCursor(posInText('a1'));
      el._broadcastSelectedNode(true);
      setCursor(posInText('b1'));
      el._broadcastSelectedNode(true);
      setCursor(posInText('intro'));
      el._broadcastSelectedNode(true);

      expect(messages).to.have.lengthOf(3);
      expect(messages[1].node).to.deep.equal({ anchorType: 'table', proseIndex: tableStarts[1] + 1 });
      expect(messages[1].scrollIntoView).to.equal(true);
      expect(messages[2].node).to.deep.equal({ anchorType: 'content', proseIndex: 1 });
    });

    it('does not scroll for a table-cell selection mirrored from the iframe', () => {
      setCursor(posInText('a1'));
      ctx.mirroringFromIframe = true;
      el._broadcastSelectedNode(true);

      expect(messages).to.have.lengthOf(1);
      expect(messages[0].node).to.equal(null);
      expect(messages[0].scrollIntoView).to.equal(false);
    });
  });
});

describe('EwEditorDoc - teardown on removal (#1406)', () => {
  it('broadcasts empty editor html when the element is removed', () => {
    const el = document.createElement('ew-editor-doc');
    document.body.append(el);
    canvasBus.editorHtmlState.emit('<main><div><p>hi</p></div></main>');
    const seen = [];
    const unsub = canvasBus.editorHtmlState.subscribe((html) => seen.push(html));
    seen.length = 0;
    el.remove();
    unsub();
    canvasBus.editorHtmlState.emit('');
    expect(seen.length > 0).to.equal(true);
    expect(seen[seen.length - 1]).to.equal('');
  });
});
