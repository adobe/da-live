import { expect } from '@esm-bundle/chai';
import { EditorState, TextSelection } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import {
  getLinkInfoInSelection,
  selectionHasLink,
} from '../../../../../blocks/canvas/editor-utils/command-helpers.js';

const schema = getSchema();

function stateWithLink({ href = 'https://example.com', text = 'hello', cursorPos = 3 } = {}) {
  const linkMark = schema.marks.link.create({ href });
  const textNode = schema.text(text, [linkMark]);
  const para = schema.nodes.paragraph.create(null, textNode);
  const doc = schema.nodes.doc.create(null, para);
  const sel = TextSelection.create(doc, cursorPos);
  return EditorState.create({ schema, doc, selection: sel });
}

function stateWithPlainText({ cursorPos = 3 } = {}) {
  const textNode = schema.text('hello');
  const para = schema.nodes.paragraph.create(null, textNode);
  const doc = schema.nodes.doc.create(null, para);
  const sel = TextSelection.create(doc, cursorPos);
  return EditorState.create({ schema, doc, selection: sel });
}

describe('getLinkInfoInSelection — empty selection inside link', () => {
  it('returns link info when cursor is in the middle of a link', () => {
    const state = stateWithLink({ href: 'https://example.com', text: 'hello', cursorPos: 3 });
    const info = getLinkInfoInSelection(state);
    expect(info).to.not.be.null;
    expect(info.href).to.equal('https://example.com');
    expect(info.text).to.equal('hello');
  });

  it('returns link info when cursor is at the start of a link (pos 1)', () => {
    const state = stateWithLink({ href: 'https://start.com', text: 'hello', cursorPos: 1 });
    const info = getLinkInfoInSelection(state);
    expect(info).to.not.be.null;
    expect(info.href).to.equal('https://start.com');
  });

  it('returns null when cursor is on plain text (no link)', () => {
    const state = stateWithPlainText({ cursorPos: 3 });
    const info = getLinkInfoInSelection(state);
    expect(info).to.be.null;
  });

  it('selectionHasLink returns true for empty selection inside a link', () => {
    const state = stateWithLink({ cursorPos: 2 });
    expect(selectionHasLink(state)).to.be.true;
  });

  it('selectionHasLink returns false for empty selection outside a link', () => {
    const state = stateWithPlainText({ cursorPos: 2 });
    expect(selectionHasLink(state)).to.be.false;
  });

  it('returns null when cursor is immediately after the link', () => {
    // "hello" has 5 chars, paragraph opens at pos 0, text occupies [1,6), pos 6 is outside
    const state = stateWithLink({ text: 'hello', cursorPos: 6 });
    expect(getLinkInfoInSelection(state)).to.be.null;
  });
});
