/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { NodeSelection, TextSelection } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

before(async () => {
  await import('../../../../../blocks/canvas/ew-editor-doc/ew-editor-doc.js');
});

// Wraps view.dispatch so tests can assert whether the guarded early-returns in
// _scrollDocToProseIndex actually skip dispatching, while still letting dispatched
// transactions apply so the resulting selection can be inspected.
function spyDispatch(view) {
  const calls = [];
  const original = view.dispatch.bind(view);
  view.dispatch = (tr) => {
    calls.push(tr);
    original(tr);
  };
  return calls;
}

// Replaces the default single-paragraph doc with a text paragraph followed by a
// paragraph wrapping an image, mirroring how a real page mixes prose and images.
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

  it('creates a TextSelection near proseIndex for a non-image kind and does not broadcast', () => {
    const dispatchCalls = spyDispatch(editor.view);
    const broadcastCalls = [];
    el._broadcastSelectedNode = (...args) => broadcastCalls.push(args);
    el._proseContext = { view: editor.view };

    el._scrollDocToProseIndex(3, 'paragraph');

    expect(dispatchCalls).to.have.lengthOf(1);
    expect(editor.view.state.selection).to.be.instanceOf(TextSelection);
    expect(broadcastCalls).to.deep.equal([]);
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
