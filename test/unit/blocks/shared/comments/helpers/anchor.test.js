import { expect } from '@esm-bundle/chai';
import { TextSelection } from 'da-y-wrapper';
import { getSelectionData } from '../../../../../../blocks/shared/comments/helpers/anchor.js';
import { createTestEditor, destroyEditor } from '../../../edit/prose/test-helpers.js';

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
