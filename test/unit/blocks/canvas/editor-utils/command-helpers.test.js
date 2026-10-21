import { expect } from '@esm-bundle/chai';
import { EditorState, NodeSelection, TextSelection } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import {
  applyLink,
  getLinkInfoInSelection,
  selectionHasLink,
  canComment,
  canDeleteElement,
  deleteElement,
} from '../../../../../blocks/canvas/editor-utils/command-helpers.js';

const schema = getSchema();

describe('deleteElement', () => {
  const paragraph = (text) => schema.nodes.paragraph.create(null, text ? schema.text(text) : null);

  function viewWith(nodes, select) {
    const doc = schema.nodes.doc.create(null, nodes);
    const view = {
      state: EditorState.create({ schema, doc, selection: select(doc) }),
      dispatch(tr) { this.state = this.state.apply(tr); },
    };
    return view;
  }

  it('deletes the whole paragraph at the caret, preserving its neighbors', () => {
    const before = paragraph('before');
    const after = paragraph('after');
    const view = viewWith(
      [before, paragraph('delete me'), after],
      (doc) => TextSelection.create(doc, before.nodeSize + 3),
    );
    deleteElement(view);
    expect(view.state.doc.toJSON().content).to.deep.equal([before.toJSON(), after.toJSON()]);
    view.state.doc.check();
  });

  it('deletes a heading even when only part of its text is selected', () => {
    const heading = schema.nodes.heading.create({ level: 2 }, schema.text('heading'));
    const after = paragraph('after');
    const view = viewWith([heading, after], (doc) => TextSelection.create(doc, 2, 4));
    deleteElement(view);
    expect(view.state.doc.firstChild.eq(after)).to.be.true;
    expect(view.state.doc.childCount).to.equal(1);
  });

  it('keeps a valid editable document when deleting the only paragraph', () => {
    const view = viewWith([paragraph('only')], (doc) => TextSelection.create(doc, 2));
    deleteElement(view);
    expect(view.state.doc.childCount).to.equal(1);
    expect(view.state.doc.firstChild.type.name).to.equal('paragraph');
    expect(view.state.doc.textContent).to.equal('');
    view.state.doc.check();
  });

  it('deletes an empty paragraph', () => {
    const after = paragraph('after');
    const view = viewWith([paragraph(), after], (doc) => TextSelection.create(doc, 1));
    deleteElement(view);
    expect(view.state.doc.childCount).to.equal(1);
    expect(view.state.doc.firstChild.eq(after)).to.be.true;
  });

  it('deletes a paragraph inside a blockquote without deleting its siblings', () => {
    const after = paragraph('after');
    const quote = schema.nodes.blockquote.create(null, [paragraph('delete me'), after]);
    const view = viewWith([quote], (doc) => TextSelection.create(doc, 3));
    deleteElement(view);
    expect(view.state.doc.firstChild.type.name).to.equal('blockquote');
    expect(view.state.doc.firstChild.childCount).to.equal(1);
    expect(view.state.doc.firstChild.firstChild.eq(after)).to.be.true;
    view.state.doc.check();
  });

  it('keeps table cells valid when deleting their only paragraph', () => {
    const cell = schema.nodes.table_cell.create(null, paragraph('delete me'));
    const row = schema.nodes.table_row.create(null, [cell, cell]);
    const table = schema.nodes.table.create(null, row);
    const view = viewWith([table], (doc) => TextSelection.create(doc, 5));
    deleteElement(view);
    const result = view.state.doc.firstChild.firstChild;
    expect(result.childCount).to.equal(2);
    expect(result.firstChild.textContent).to.equal('');
    expect(result.lastChild.textContent).to.equal('delete me');
    view.state.doc.check();
  });

  it('deletes only a selected image, preserving surrounding text', () => {
    const image = schema.nodes.image.create({ src: '/x.png' });
    const para = schema.nodes.paragraph.create(null, [schema.text('before'), image, schema.text('after')]);
    const view = viewWith([para], (doc) => NodeSelection.create(doc, 7));
    deleteElement(view);
    expect(view.state.doc.firstChild.textContent).to.equal('beforeafter');
    expect(view.state.doc.firstChild.childCount).to.equal(1);
    view.state.doc.check();
  });

  it('does not delete multiple elements for a selection spanning paragraphs', () => {
    const first = paragraph('first');
    const view = viewWith(
      [first, paragraph('second')],
      (doc) => TextSelection.create(doc, 2, first.nodeSize + 3),
    );
    const original = view.state.doc;
    expect(canDeleteElement(view.state)).to.be.false;
    deleteElement(view);
    expect(view.state.doc).to.equal(original);
  });
});

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

describe('canComment', () => {
  function stateWithRange(from, to) {
    const para = schema.nodes.paragraph.create(null, schema.text('hello world'));
    const doc = schema.nodes.doc.create(null, para);
    return EditorState.create({ schema, doc, selection: TextSelection.create(doc, from, to) });
  }

  it('is false for an empty (collapsed) selection', () => {
    expect(canComment(stateWithRange(3, 3))).to.equal(false);
  });

  it('is true for a non-empty text selection', () => {
    expect(canComment(stateWithRange(1, 6))).to.equal(true);
  });
});

describe('applyLink - title', () => {
  function viewFrom(state) {
    const view = { state };
    view.dispatch = (tr) => { view.state = view.state.apply(tr); };
    return view;
  }

  function stateWithSelection(from, to) {
    const para = schema.nodes.paragraph.create(null, schema.text('hello'));
    const doc = schema.nodes.doc.create(null, para);
    return EditorState.create({ schema, doc, selection: TextSelection.create(doc, from, to) });
  }

  function linkMarkOf(state) {
    let mark = null;
    state.doc.descendants((node) => {
      const m = schema.marks.link.isInSet(node.marks);
      if (m) mark = m;
    });
    return mark;
  }

  it('writes a trimmed title onto the link mark', () => {
    const view = viewFrom(stateWithSelection(1, 6));
    applyLink(view, { href: 'https://x.com', text: 'hello', title: '  Tip  ' });
    const mark = linkMarkOf(view.state);
    expect(mark.attrs.href).to.equal('https://x.com');
    expect(mark.attrs.title).to.equal('Tip');
  });

  it('writes null title when the title is empty', () => {
    const view = viewFrom(stateWithSelection(1, 6));
    applyLink(view, { href: 'https://x.com', text: 'hello', title: '' });
    expect(linkMarkOf(view.state).attrs.title).to.equal(null);
  });

  it('writes null title when the title is omitted (backward compatible)', () => {
    const view = viewFrom(stateWithSelection(1, 6));
    applyLink(view, { href: 'https://x.com', text: 'hello' });
    expect(linkMarkOf(view.state).attrs.title).to.equal(null);
  });

  it('writes and clears the title on a selected image', () => {
    const image = schema.nodes.image.create({ src: '/x.png', href: 'https://old.com' });
    const para = schema.nodes.paragraph.create(null, image);
    const doc = schema.nodes.doc.create(null, para);
    const state = EditorState.create({
      schema,
      doc,
      selection: NodeSelection.create(doc, 1),
    });
    const view = viewFrom(state);

    applyLink(view, { href: 'https://x.com', title: '  Tip  ' });
    expect(view.state.selection.node.attrs.title).to.equal('Tip');

    applyLink(view, { href: 'https://x.com', title: '' });
    expect(view.state.selection.node.attrs.title).to.equal(null);
  });
});
