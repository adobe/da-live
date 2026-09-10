import { expect } from '@esm-bundle/chai';
import { TextSelection } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createTestEditor, destroyEditor } = await import('../../edit/prose/test-helpers.js');
const blockFocusMod = await import('../../../../../blocks/canvas/ew-editor-doc/prose-plugins/blockFocus.js');

const {
  default: blockFocus,
  setBlockFocus,
  clearBlockFocus,
  getBlockFocus,
  isSelectionInFocusedBlock,
  resolveBlockFocusPos,
} = blockFocusMod;

function setParagraphs(editor, texts) {
  const { state } = editor.view;
  const { schema } = state;
  const nodes = texts.map((t) => schema.nodes.paragraph.create(null, schema.text(t)));
  editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, nodes));
}

function hiddenFlags(editor) {
  return [...editor.view.dom.children].map((el) => el.classList.contains('nx-block-hidden'));
}

describe('blockFocus plugin', () => {
  let editor;
  beforeEach(async () => {
    editor = await createTestEditor({ additionalPlugins: [blockFocus()] });
  });
  afterEach(() => destroyEditor(editor));

  it('hides every top-level block except the focused one', () => {
    setParagraphs(editor, ['a', 'b', 'c']);
    // Top-level positions: a=0, b=3, c=6 (each paragraph nodeSize = 3).
    setBlockFocus(editor.view, 3);

    expect(getBlockFocus(editor.view.state)).to.equal(3);
    expect(hiddenFlags(editor)).to.deep.equal([true, false, true]);
  });

  it('reveals all blocks again when focus is cleared', () => {
    setParagraphs(editor, ['a', 'b', 'c']);
    setBlockFocus(editor.view, 3);
    clearBlockFocus(editor.view);

    expect(getBlockFocus(editor.view.state)).to.equal(null);
    expect(hiddenFlags(editor)).to.deep.equal([false, false, false]);
  });

  it('does not hide anything when no block is focused', () => {
    setParagraphs(editor, ['a', 'b']);
    expect(hiddenFlags(editor)).to.deep.equal([false, false]);
  });

  function selectAt(pos) {
    const { state } = editor.view;
    editor.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)));
  }

  it('reports the selection as inside the focused block while editing it', () => {
    setParagraphs(editor, ['aa', 'bb', 'cc']);
    // 'bb' is the second paragraph: starts at 4, text runs 5..7.
    setBlockFocus(editor.view, 4);
    selectAt(6);
    expect(isSelectionInFocusedBlock(editor.view.state)).to.be.true;
  });

  it('reports the selection as outside once it leaves the focused block', () => {
    setParagraphs(editor, ['aa', 'bb', 'cc']);
    setBlockFocus(editor.view, 4);
    selectAt(1); // inside the first paragraph 'aa'
    expect(isSelectionInFocusedBlock(editor.view.state)).to.be.false;
  });

  it('reports true when nothing is focused', () => {
    setParagraphs(editor, ['aa', 'bb']);
    expect(isSelectionInFocusedBlock(editor.view.state)).to.be.true;
  });

  // A collab (Yjs) undo is applied as a large y-sync replace that can remap the tracked
  // focus position to a garbage offset. resolveBlockFocusPos keeps a still-valid mapped
  // position (so focus tracks the block independent of the selection) and only re-resolves
  // from the selection when the mapped position is no longer a valid top-level start — so
  // the block being edited stays focused (and visible) instead of being hidden and
  // appearing deleted.
  describe('resolveBlockFocusPos', () => {
    // Paragraph offsets for ['aa','bb','cc']: aa=0 (0..4), bb=4 (4..8), cc=8 (8..12).
    function threeParaDoc() {
      setParagraphs(editor, ['aa', 'bb', 'cc']);
      return editor.view.state.doc;
    }

    it('keeps a mapped position that still lands on a top-level block start', () => {
      const doc = threeParaDoc();
      // mapped=4 ('bb') is valid; focus stays there regardless of the selection (in 'cc').
      expect(resolveBlockFocusPos(doc, 4, 9)).to.equal(4);
    });

    it('repairs an out-of-range mapped position using the selection', () => {
      const doc = threeParaDoc();
      // 999 is past the doc; selection sits inside 'bb' (pos 5..7) → repaired to 4.
      expect(resolveBlockFocusPos(doc, 999, 6)).to.equal(4);
    });

    it('repairs a mapped position that no longer lands on a block boundary', () => {
      const doc = threeParaDoc();
      // 6 is inside 'bb' but not a top-level start; selection in 'cc' → repaired to 8.
      expect(resolveBlockFocusPos(doc, 6, 9)).to.equal(8);
    });

    it('falls back to the mapped position when the selection cannot be resolved', () => {
      const doc = threeParaDoc();
      expect(resolveBlockFocusPos(doc, 999, null)).to.equal(999);
    });

    it('keeps focus on the block across a normal edit', () => {
      setParagraphs(editor, ['aa', 'bb', 'cc']);
      setBlockFocus(editor.view, 4); // focus 'bb'
      // Edit inside the focused block; the mapped position stays valid → focus stays 'bb'.
      const { state } = editor.view;
      editor.view.dispatch(state.tr.insertText('X', 6));
      const pos = getBlockFocus(editor.view.state);
      const node = pos == null ? null : editor.view.state.doc.nodeAt(pos);
      expect(node, 'focused block still resolves to a node').to.exist;
      expect(node.textContent).to.equal('bXb');
    });
  });
});
