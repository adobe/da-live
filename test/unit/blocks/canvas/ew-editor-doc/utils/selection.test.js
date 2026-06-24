import { expect } from '@esm-bundle/chai';
import { TextSelection, NodeSelection } from 'da-y-wrapper';
import { createTestEditor, destroyEditor } from '../../../edit/prose/test-helpers.js';
import {
  describeDocSelection,
  applyHighlight,
  SEL_BLOCK,
  SEL_ITEM,
  SEL_TEXT,
  SEL_EMPTY,
} from '../../../../../../blocks/canvas/ew-editor-doc/utils/selection.js';

describe('describeDocSelection', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor();
  });

  afterEach(() => {
    destroyEditor(editor);
  });

  it('returns empty selectionType for an empty (cursor) selection', () => {
    const result = describeDocSelection(editor.view);
    expect(result.selectionType).to.equal(SEL_EMPTY);
    expect(result.selectedText).to.equal('');
    expect(result.selectedHTML).to.equal('');
    expect(result.kind).to.equal('text');
  });

  it('returns text selectionType for a non-empty text selection', () => {
    editor.view.dispatch(editor.view.state.tr.insertText('hello'));
    const sel = TextSelection.create(editor.view.state.doc, 1, 6);
    editor.view.dispatch(editor.view.state.tr.setSelection(sel));

    const result = describeDocSelection(editor.view);
    expect(result.selectionType).to.equal(SEL_TEXT);
    expect(result.selectedText).to.equal('hello');
    expect(result.kind).to.equal('text');
  });

  it('returns item selectionType for a NodeSelection inside a block', () => {
    const { state } = editor.view;
    const { schema } = state;
    const para = schema.nodes.paragraph.create(null, schema.nodes.image.create({ src: '/x.png' }));
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, para));

    let imgPos = -1;
    editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') imgPos = pos;
    });
    const sel = NodeSelection.create(editor.view.state.doc, imgPos);
    editor.view.dispatch(editor.view.state.tr.setSelection(sel));

    const result = describeDocSelection(editor.view);
    expect(result.selectionType).to.equal(SEL_ITEM);
    expect(result.kind).to.equal('node');
  });

  it('returns block selectionType for a NodeSelection at the top level', () => {
    editor.view.dispatch(editor.view.state.tr.insertText('content'));
    // position 0 selects the top-level paragraph node
    const sel = NodeSelection.create(editor.view.state.doc, 0);
    editor.view.dispatch(editor.view.state.tr.setSelection(sel));

    const result = describeDocSelection(editor.view);
    expect(result.selectionType).to.equal(SEL_BLOCK);
    expect(result.kind).to.equal('node');
    expect(result.selectedHTML).to.equal('');
  });

  it('includes selFrom and selTo in all results', () => {
    editor.view.dispatch(editor.view.state.tr.insertText('hi'));
    const sel = TextSelection.create(editor.view.state.doc, 1, 3);
    editor.view.dispatch(editor.view.state.tr.setSelection(sel));

    const result = describeDocSelection(editor.view);
    expect(result.selFrom).to.equal(1);
    expect(result.selTo).to.equal(3);
  });
});

describe('applyHighlight', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor();
    editor.view.dispatch(editor.view.state.tr.insertText('hello world'));
  });

  afterEach(() => {
    destroyEditor(editor);
  });

  it('does nothing when view is null', () => {
    const initialSel = editor.view.state.selection;
    applyHighlight(null, { selFrom: 1, selTo: 5, selectionType: SEL_TEXT });
    expect(editor.view.state.selection).to.equal(initialSel);
  });

  it('does nothing when selFrom is not a number', () => {
    const initialSel = editor.view.state.selection;
    applyHighlight(editor.view, { selFrom: '1', selTo: 5, selectionType: SEL_TEXT });
    expect(editor.view.state.selection.from).to.equal(initialSel.from);
  });

  it('does nothing when selTo is not a number', () => {
    const initialSel = editor.view.state.selection;
    applyHighlight(editor.view, { selFrom: 1, selTo: undefined, selectionType: SEL_TEXT });
    expect(editor.view.state.selection.from).to.equal(initialSel.from);
  });

  it('does nothing when selFrom is negative', () => {
    const initialSel = editor.view.state.selection;
    applyHighlight(editor.view, { selFrom: -1, selTo: 5, selectionType: SEL_TEXT });
    expect(editor.view.state.selection.from).to.equal(initialSel.from);
  });

  it('does nothing when selTo exceeds doc size', () => {
    const { doc } = editor.view.state;
    const initialSel = editor.view.state.selection;
    const overSize = doc.content.size + 1;
    applyHighlight(editor.view, { selFrom: 1, selTo: overSize, selectionType: SEL_TEXT });
    expect(editor.view.state.selection.from).to.equal(initialSel.from);
  });

  it('creates a TextSelection for text selectionType', () => {
    applyHighlight(editor.view, { selFrom: 1, selTo: 6, selectionType: SEL_TEXT });
    const sel = editor.view.state.selection;
    expect(sel).to.be.instanceOf(TextSelection);
    expect(sel.from).to.equal(1);
    expect(sel.to).to.equal(6);
  });

  it('creates a TextSelection for empty selectionType', () => {
    applyHighlight(editor.view, { selFrom: 1, selTo: 6, selectionType: SEL_EMPTY });
    expect(editor.view.state.selection).to.be.instanceOf(TextSelection);
  });

  it('creates a NodeSelection for block selectionType', () => {
    // position 0 is a valid node position for the top-level paragraph
    applyHighlight(editor.view, { selFrom: 0, selTo: 0, selectionType: SEL_BLOCK });
    expect(editor.view.state.selection).to.be.instanceOf(NodeSelection);
  });

  it('creates a NodeSelection for item selectionType', () => {
    applyHighlight(editor.view, { selFrom: 0, selTo: 0, selectionType: SEL_ITEM });
    expect(editor.view.state.selection).to.be.instanceOf(NodeSelection);
  });
});
