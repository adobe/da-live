import { expect } from '@esm-bundle/chai';
import { EditorState, TextSelection, Fragment } from 'da-y-wrapper';
import { CellSelection } from 'prosemirror-tables';
import { getSchema } from 'da-parser';
import { setNx } from '../../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const schema = getSchema();

let getSlashContext;
let hasCellSelection;

before(async () => {
  const mod = await import('../../../../../../blocks/canvas/ew-editor-doc/slash-menu/slash-menu.js');
  getSlashContext = mod.getSlashContext;
  hasCellSelection = mod.hasCellSelection;
});

function stateWithParagraph(text) {
  const para = schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
  const doc = schema.nodes.doc.create(null, para);
  // doc.content.size is after the paragraph's close bracket; -1 puts cursor inside it
  const sel = TextSelection.create(doc, doc.content.size - 1);
  return EditorState.create({ schema, doc, selection: sel });
}

function stateWithCellParagraph(text) {
  const para = schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
  const cell = schema.nodes.table_cell.create(null, para);
  const row = schema.nodes.table_row.create(null, cell);
  const table = schema.nodes.table.create(null, row);
  const doc = schema.nodes.doc.create(null, table);
  // doc -> table -> table_row -> table_cell -> paragraph: 4 open tokens before the
  // text, 4 close tokens after it, so end-of-text is content.size - 4.
  const sel = TextSelection.create(doc, doc.content.size - 4);
  return EditorState.create({ schema, doc, selection: sel });
}

describe('getSlashContext', () => {
  it('returns the query for a single-word slash command', () => {
    const ctx = getSlashContext(stateWithParagraph('/banner'));
    expect(ctx).to.not.be.null;
    expect(ctx.query).to.equal('banner');
  });

  it('allows spaces for multi-term queries', () => {
    const ctx = getSlashContext(stateWithParagraph('/banner blue'));
    expect(ctx).to.not.be.null;
    expect(ctx.query).to.equal('banner blue');
  });

  it('returns null when the paragraph does not start with a slash', () => {
    expect(getSlashContext(stateWithParagraph('banner'))).to.be.null;
  });

  it('returns null for an over-long query (cap)', () => {
    expect(getSlashContext(stateWithParagraph(`/${'x'.repeat(60)}`))).to.be.null;
  });

  it('ignores a mid-line "/" outside a block-options cell (legit "/" in text)', () => {
    expect(getSlashContext(stateWithParagraph('1/2 cup sugar'))).to.be.null;
  });

  it('in a block-options cell, opens on "/" right after a comma-separated value', () => {
    const ctx = getSlashContext(stateWithCellParagraph('red, /bl'));
    expect(ctx).to.not.be.null;
    expect(ctx.query).to.equal('bl');
    expect(ctx.anchorPos).to.equal(9); // position of the second "/"
  });

  it('in a block-options cell, ignores a mid-line "/" not preceded by a comma', () => {
    expect(getSlashContext(stateWithCellParagraph('red /bl'))).to.be.null;
  });
});

describe('hasCellSelection', () => {
  it('is false for a plain text selection', () => {
    expect(hasCellSelection(stateWithParagraph('/banner'))).to.be.false;
  });

  it('is true when one or more table cells are selected', () => {
    const cell = (text) => schema.nodes.table_cell.create(
      null,
      schema.nodes.paragraph.create(null, schema.text(text)),
    );
    const row = schema.nodes.table_row.create(null, Fragment.fromArray([cell('a'), cell('b')]));
    const table = schema.nodes.table.create(null, row);
    const doc = schema.nodes.doc.create(null, table);

    const cellPos = [];
    doc.descendants((node, pos) => {
      if (node.type.spec.tableRole === 'cell') cellPos.push(pos);
    });

    let state = EditorState.create({ schema, doc });
    state = state.apply(state.tr.setSelection(CellSelection.create(doc, cellPos[0], cellPos[1])));
    expect(hasCellSelection(state)).to.be.true;
  });
});
