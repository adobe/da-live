import { expect } from '@esm-bundle/chai';
import { TextSelection } from 'da-y-wrapper';
import { getSelectionData, encodeAnchor, decodeAnchor, resolveAnchor } from '../../../../../../blocks/canvas/comments/helpers/anchor.js';
import { createTestEditor, destroyEditor } from '../../../edit/prose/test-helpers.js';

async function editorWithText(text, selFrom, selTo) {
  const editor = await createTestEditor();
  editor.view.dispatch(editor.view.state.tr.insertText(text));
  const { doc, tr } = editor.view.state;
  editor.view.dispatch(tr.setSelection(TextSelection.create(doc, selFrom, selTo)));
  return editor;
}

async function editorWithParas(texts) {
  const editor = await createTestEditor();
  const { schema } = editor.view.state;
  const paras = texts.map((t) => schema.node('paragraph', null, schema.text(t)));
  const { size } = editor.view.state.doc.content;
  editor.view.dispatch(editor.view.state.tr.replaceWith(0, size, paras));
  return editor;
}

describe('getSelectionData', () => {
  let editor;
  afterEach(() => {
    if (editor) destroyEditor(editor);
    editor = null;
  });

  it('returns null on empty selection', async () => {
    editor = await createTestEditor();
    expect(getSelectionData(editor.view.state)).to.be.null;
  });

  it('returns text anchor for a text range', async () => {
    editor = await createTestEditor();
    editor.view.dispatch(editor.view.state.tr.insertText('hello world'));
    const { doc, tr } = editor.view.state;
    editor.view.dispatch(tr.setSelection(TextSelection.create(doc, 1, 6)));
    const data = getSelectionData(editor.view.state);
    expect(data.anchorType).to.equal('text');
    expect(data.anchorText).to.equal('hello');
  });

  it('returns image anchor for a TextSelection wrapping an image (layout mode)', async () => {
    editor = await createTestEditor();
    const { schema } = editor.view.state;
    const image = schema.nodes.image.create({ src: '/x.png' });
    editor.view.dispatch(editor.view.state.tr.replaceSelectionWith(image));

    let imgPos = null;
    editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'image') return true;
      imgPos = pos;
      return false;
    });
    expect(imgPos).to.not.be.null;

    const sel = TextSelection.create(editor.view.state.doc, imgPos, imgPos + 1);
    editor.view.dispatch(editor.view.state.tr.setSelection(sel));

    const data = getSelectionData(editor.view.state);
    expect(data.anchorType).to.equal('image');
    expect(data.anchorText).to.equal('');
  });
});

describe('anchor round-trip across a move', () => {
  let source;
  let moved;
  afterEach(() => {
    if (source) destroyEditor(source);
    if (moved) destroyEditor(moved);
    source = null;
    moved = null;
  });

  const encode = (editor) => encodeAnchor({
    selectionData: getSelectionData(editor.view.state),
    state: editor.view.state,
  });

  it('resolves via relpos in the same doc (fast path)', async () => {
    source = await editorWithText('hello world', 1, 6);
    const anchor = encode(source);
    expect(decodeAnchor({ anchor, state: source.view.state })).to.deep.equal({ from: 1, to: 6 });
  });

  it('recovers via structural anchor when the ydoc identity is fresh (moved doc)', async () => {
    source = await editorWithText('hello world', 1, 6);
    const anchor = encode(source);
    expect(anchor.structural).to.exist;

    // Same content, brand-new Y.Doc (new item IDs) — relpos cannot resolve.
    moved = await editorWithText('hello world', 1, 1);
    expect(decodeAnchor({ anchor, state: moved.view.state })).to.deep.equal({ from: 1, to: 6 });
  });

  it('detaches (returns null) when the target content changed — never mis-anchors', async () => {
    source = await editorWithText('hello world', 1, 6);
    const anchor = encode(source);

    moved = await editorWithText('goodbye world', 1, 1);
    expect(decodeAnchor({ anchor, state: moved.view.state })).to.be.null;
  });

  it('anchors the correct occurrence when identical blocks repeat (move)', async () => {
    // Two byte-identical paragraphs; comment the "hello" in the SECOND one.
    source = await editorWithParas(['hello world', 'hello world']);
    const { doc, tr } = source.view.state;
    source.view.dispatch(tr.setSelection(TextSelection.create(doc, 14, 19)));
    const anchor = encode(source);

    moved = await editorWithParas(['hello world', 'hello world']);
    // Positional (path+offset), not content search: resolves to the 2nd block
    // (14..19), never the identical first block (1..6).
    expect(decodeAnchor({ anchor, state: moved.view.state })).to.deep.equal({ from: 14, to: 19 });
  });

  it('reports source: relpos in the same doc, structural after a move', async () => {
    source = await editorWithText('The Experience is great', 5, 15);
    const anchor = encode(source);
    expect(resolveAnchor({ anchor, state: source.view.state }).source).to.equal('relpos');

    moved = await editorWithText('The Experience is great', 1, 1);
    const res = resolveAnchor({ anchor, state: moved.view.state });
    expect(res.source).to.equal('structural');
    expect(res.range).to.deep.equal({ from: 5, to: 15 });
  });

  it('the bug: a structural-only anchor detaches when its text is edited on a moved page', async () => {
    source = await editorWithText('The Experience is great', 5, 15);
    const anchor = encode(source);
    moved = await editorWithText('The Experience is great', 1, 1);
    // Edit inside the commented word: relpos is dead (moved), structural hash
    // now mismatches -> detaches. This is what re-anchoring fixes.
    moved.view.dispatch(moved.view.state.tr.insertText('TEST', 8));
    expect(decodeAnchor({ anchor, state: moved.view.state })).to.be.null;
  });

  it('the fix: re-anchoring a recovered comment lets edits track on a moved page', async () => {
    source = await editorWithText('The Experience is great', 5, 15);
    const anchor = encode(source);
    moved = await editorWithText('The Experience is great', 1, 1);

    // Controller heal: re-encode the recovered range against the moved ydoc.
    const { range } = resolveAnchor({ anchor, state: moved.view.state });
    const healed = encodeAnchor({
      selectionData: {
        from: range.from,
        to: range.to,
        anchorType: anchor.anchorType,
        anchorText: anchor.anchorText,
      },
      state: moved.view.state,
    });
    expect(resolveAnchor({ anchor: healed, state: moved.view.state }).source).to.equal('relpos');

    // Now the same edit that detached the original keeps the healed one attached.
    moved.view.dispatch(moved.view.state.tr.insertText('TEST', 8));
    expect(decodeAnchor({ anchor: healed, state: moved.view.state })).to.not.be.null;
  });
});
