import { expect } from '@esm-bundle/chai';
import { TextSelection } from 'da-y-wrapper';
import { getSelectionData } from '../../../../../../../../blocks/edit/prose/plugins/comments/helpers/anchor.js';
import { createTestEditor, destroyEditor } from '../../../test-helpers.js';

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
});
