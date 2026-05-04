import { expect } from '@esm-bundle/chai';
import { TextSelection } from 'da-y-wrapper';
import loremIpsum from '../../../../../../blocks/edit/prose/plugins/slashMenu/loremIpsum.js';
import { createTestEditor, destroyEditor } from '../test-helpers.js';

function setCursorIntoEmptyParagraph(view) {
  const { state, dispatch } = view;
  const { schema } = state;
  // Replace doc with a single empty paragraph to satisfy schema (textblock rules)
  const tr = state.tr.replaceWith(0, state.doc.content.size, schema.nodes.paragraph.create());
  dispatch(tr);
  // Position cursor inside the paragraph (at position 1)
  const next = view.state.tr.setSelection(TextSelection.create(view.state.doc, 1));
  dispatch(next);
}

describe('slashMenu/loremIpsum', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor();
    setCursorIntoEmptyParagraph(editor.view);
  });

  afterEach(() => destroyEditor(editor));

  it('Inserts text containing the canonical opening line', () => {
    let dispatched;
    loremIpsum(editor.view.state, (tr) => { dispatched = tr; }, 1);
    expect(dispatched).to.exist;
    const text = dispatched.docs[0].textBetween(0, dispatched.docs[0].content.size, ' ', ' ');
    // Re-apply the transaction to inspect the resulting doc text:
    const newState = editor.view.state.apply(dispatched);
    expect(newState.doc.textContent).to.contain('Lorem ipsum');
    expect(text).to.be.a('string');
  });

  it('Caps line count to 100', () => {
    let dispatched;
    loremIpsum(editor.view.state, (tr) => { dispatched = tr; }, 9999);
    const newState = editor.view.state.apply(dispatched);
    const occurrences = (newState.doc.textContent.match(/Lorem ipsum/g) || []).length;
    expect(occurrences).to.be.greaterThan(0);
    expect(occurrences).to.be.lessThan(101);
  });

  it('No-ops when selection has no $cursor', () => {
    const { state, dispatch } = editor.view;
    // Set a non-cursor selection by spanning the whole doc
    const tr = state.tr.setSelection(TextSelection.create(state.doc, 0, state.doc.content.size));
    dispatch(tr);
    let dispatched;
    loremIpsum(editor.view.state, (t) => { dispatched = t; }, 1);
    expect(dispatched).to.equal(undefined);
  });

  it('Defaults to 5 lines when called without a count', () => {
    let dispatched;
    loremIpsum(editor.view.state, (tr) => { dispatched = tr; });
    const newState = editor.view.state.apply(dispatched);
    expect(newState.doc.textContent.length).to.be.greaterThan(0);
  });
});
