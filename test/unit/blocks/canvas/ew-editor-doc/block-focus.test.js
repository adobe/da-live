import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createTestEditor, destroyEditor } = await import('../../edit/prose/test-helpers.js');
const blockFocusMod = await import('../../../../../blocks/canvas/ew-editor-doc/prose-plugins/blockFocus.js');

const { default: blockFocus, setBlockFocus, clearBlockFocus, getBlockFocus } = blockFocusMod;

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
});
