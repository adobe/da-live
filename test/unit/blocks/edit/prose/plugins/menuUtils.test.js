import { expect } from '@esm-bundle/chai';
import { TextSelection } from 'da-y-wrapper';
import { markActive } from '../../../../../../blocks/edit/prose/plugins/menu/menuUtils.js';
import { createTestEditor, destroyEditor } from '../test-helpers.js';

describe('menuUtils.markActive', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor();
    // Insert a paragraph with text "hello"
    const { schema } = editor.view.state;
    const tr = editor.view.state.tr.replaceWith(
      0,
      editor.view.state.doc.content.size,
      schema.nodes.paragraph.create(null, schema.text('hello world')),
    );
    editor.view.dispatch(tr);
  });

  afterEach(() => destroyEditor(editor));

  it('Returns false for an empty selection with no stored marks', () => {
    const linkMark = editor.view.state.schema.marks.link;
    expect(markActive(editor.view.state, linkMark)).to.be.false;
  });

  it('Returns true when text in the range has the mark', () => {
    const { state } = editor.view;
    const linkMark = state.schema.marks.link;
    const tr = state.tr
      .setSelection(TextSelection.create(state.doc, 1, 6))
      .addMark(1, 6, linkMark.create({ href: 'https://example.com' }));
    editor.view.dispatch(tr);
    expect(markActive(editor.view.state, linkMark)).to.be.true;
  });

  it('Returns false when text in the range does not have the mark', () => {
    const { state } = editor.view;
    const linkMark = state.schema.marks.link;
    const tr = state.tr
      .setSelection(TextSelection.create(state.doc, 1, 6));
    editor.view.dispatch(tr);
    expect(markActive(editor.view.state, linkMark)).to.be.false;
  });
});
