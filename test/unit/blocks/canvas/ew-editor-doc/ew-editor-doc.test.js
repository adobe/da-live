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
function tableJSON(name, contentText = 'content') {
  const cell = (text) => ({
    type: 'table_cell',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
  return {
    type: 'table',
    content: [
      { type: 'table_row', content: [cell(name)] },
      { type: 'table_row', content: [cell(contentText)] },
    ],
  };
}

// Replaces the default doc with a single block table, mirroring a page with one authored block.
// Also returns a position inside the second cell's paragraph text, suitable for tr.split —
// mirroring what pressing Enter mid-cell does.
function buildTableDoc(view) {
  const { schema } = view.state;
  const table = schema.nodeFromJSON(tableJSON('grid'));
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

// Reproduces the actual bug: opening block-edit hands the live view to a modal, but the
// controller's tracking plugin (editor-utils/prose-diff.js) still watches every dispatch
// on that view. A doc change whose common ancestor isn't a single heading/paragraph/list —
// e.g. Enter splitting a table-cell paragraph into two — fails findCommonEditableAncestor
// and falls back to a full SET_BODY redecoration. That tears down and rebuilds the iframe
// DOM the block-edit modal is live-editing, racing the target site's own (possibly async)
// block decoration against the user's still-in-flight edit.
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

    editor = await createTestEditor({
      additionalPlugins: [createTrackingPlugin(() => updateDocument(ctx))],
    });
    ctx.view = editor.view;
    ({ tablePos, cellTextPos } = buildTableDoc(editor.view));
    // buildTableDoc's own setup dispatch (a whole-doc replace) also trips the tracking
    // plugin — clear that noise so counts below reflect only the split under test.
    postMessageCalls.length = 0;

    el = document.createElement('ew-editor-doc');
    el._proseContext = { view: editor.view };
    el._controllerCtx = ctx;
  });

  afterEach(() => {
    destroyEditor(editor);
  });

  // Confirms the premise: splitting a table-cell paragraph (what Enter does) really does
  // produce a doc change findCommonEditableAncestor rejects, which fires a rerender —
  // this is the trigger the fix has to suppress.
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
