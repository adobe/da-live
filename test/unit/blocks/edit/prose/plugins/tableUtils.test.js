import { expect } from '@esm-bundle/chai';
import { TextSelection } from 'da-y-wrapper';
import { addRowLike, getTableInfo, isInTableCell } from '../../../../../../blocks/edit/prose/plugins/tableUtils.js';
import { createTestEditor, destroyEditor } from '../test-helpers.js';

function buildTable(view, rows) {
  const { state, dispatch } = view;
  const { schema } = state;
  const tableNode = schema.nodes.table;
  const rowNode = schema.nodes.table_row;
  const cellNode = schema.nodes.table_cell;
  const para = (text, attrs) => schema.nodes.paragraph.create(
    attrs || null,
    text ? schema.text(text) : null,
  );

  const tableRows = rows.map((row) => rowNode.create(
    null,
    row.map((c, i) => cellNode.create(
      i === 0 && row.length === 1 ? { colspan: 2, colwidth: null } : null,
      para(c),
    )),
  ));
  const table = tableNode.create(null, tableRows);
  const tr = state.tr.replaceWith(0, state.doc.content.size, table);
  dispatch(tr);
}

describe('tableUtils', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor();
  });

  afterEach(() => destroyEditor(editor));

  it('isInTableCell returns true inside a cell, false outside', () => {
    buildTable(editor.view, [['marquee'], ['key', 'value']]);
    const { doc } = editor.view.state;
    // doc → table → row → cell → paragraph: position 4 is inside first cell paragraph text
    let cellPos = -1;
    doc.descendants((node, pos) => {
      if (cellPos === -1 && node.type.name === 'paragraph') cellPos = pos + 1;
    });
    expect(isInTableCell(editor.view.state, cellPos)).to.be.true;
    // Position 0 is outside any cell
    expect(isInTableCell(editor.view.state, 0)).to.be.false;
  });

  it('getTableInfo returns the parsed table name from header row', () => {
    buildTable(editor.view, [['marquee'], ['key', 'value']]);
    let secondCellPos = -1;
    let row1Index = 0;
    editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph') {
        row1Index += 1;
        // Third paragraph should be the second column of row 2
        if (row1Index === 3) secondCellPos = pos + 1;
      }
    });
    const info = getTableInfo(editor.view.state, secondCellPos);
    expect(info).to.not.equal(null);
    expect(info.tableName).to.equal('marquee');
    expect(info.keyValue).to.equal('key');
    expect(info.isFirstColumn).to.be.false;
    expect(info.columnsInRow).to.equal(2);
  });

  it('getTableInfo returns null when not in a cell', () => {
    buildTable(editor.view, [['hero'], ['k', 'v']]);
    expect(getTableInfo(editor.view.state, 0)).to.equal(null);
  });

  it('getTableInfo strips parenthetical suffix from header row', () => {
    buildTable(editor.view, [['marquee (large)'], ['k', 'v']]);
    let firstCellPos = -1;
    let count = 0;
    editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph') {
        count += 1;
        if (count === 2) firstCellPos = pos + 1; // second paragraph = row 2, col 0
      }
    });
    const info = getTableInfo(editor.view.state, firstCellPos);
    expect(info).to.not.equal(null);
    expect(info.tableName).to.equal('marquee');
    expect(info.isFirstColumn).to.be.true;
    expect(info.keyValue).to.equal(null);
  });

  it('isInTableCell handles nested selections', () => {
    buildTable(editor.view, [['hero'], ['k', 'v']]);
    let firstCellPos = -1;
    editor.view.state.doc.descendants((node, pos) => {
      if (firstCellPos === -1 && node.type.name === 'paragraph') firstCellPos = pos + 1;
    });
    const tr = editor.view.state.tr.setSelection(
      TextSelection.create(editor.view.state.doc, firstCellPos),
    );
    editor.view.dispatch(tr);
    expect(isInTableCell(editor.view.state, firstCellPos)).to.be.true;
  });
});

describe('addRowLike', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor();
  });

  afterEach(() => destroyEditor(editor));

  const placeCursorIn = (view, text) => {
    let found;
    view.state.doc.descendants((node, pos) => {
      if (found === undefined && node.isText && node.text === text) found = pos;
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, found)));
  };

  const rowShapes = (view) => {
    const shapes = [];
    view.state.doc.firstChild.forEach((row) => {
      const spans = [];
      row.forEach((cell) => spans.push(cell.textContent || cell.attrs.colspan));
      shapes.push(spans);
    });
    return shapes;
  };

  const run = (view, side) => addRowLike(side)(view.state, view.dispatch);

  it('copies a merged row above it', () => {
    const { view } = editor;
    buildTable(view, [['block'], ['a', 'b'], ['merged']]);
    placeCursorIn(view, 'merged');

    expect(run(view, 'before')).to.be.true;
    expect(rowShapes(view)).to.deep.equal([['block'], ['a', 'b'], [2], ['merged']]);
  });

  it('copies a merged row below it', () => {
    const { view } = editor;
    buildTable(view, [['block'], ['merged'], ['a', 'b']]);
    placeCursorIn(view, 'merged');

    expect(run(view, 'after')).to.be.true;
    expect(rowShapes(view)).to.deep.equal([['block'], ['merged'], [2], ['a', 'b']]);
  });

  it('copies a multi-cell row', () => {
    const { view } = editor;
    buildTable(view, [['block'], ['a', 'b']]);
    placeCursorIn(view, 'a');

    expect(run(view, 'after')).to.be.true;
    expect(rowShapes(view)).to.deep.equal([['block'], ['a', 'b'], [1, 1]]);
  });

  it('keeps the cursor in the original cell', () => {
    const { view } = editor;
    buildTable(view, [['block'], ['merged']]);
    placeCursorIn(view, 'merged');

    run(view, 'before');
    expect(view.state.selection.$from.parent.textContent).to.equal('merged');
  });

  it('falls back to a full-width row when the row has a cell spanning rows', () => {
    const { view } = editor;
    const { schema } = view.state;
    const { table, table_row: tableRow, table_cell: tableCell, paragraph } = schema.nodes;
    const cell = (text, attrs) => tableCell.create(
      attrs,
      paragraph.create(null, schema.text(text)),
    );
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, table.create(null, [
      tableRow.create(null, [cell('block', { colspan: 2 })]),
      tableRow.create(null, [cell('tall', { rowspan: 2 }), cell('b')]),
      tableRow.create(null, [cell('c')]),
    ])));
    placeCursorIn(view, 'b');

    expect(run(view, 'before')).to.be.true;
    expect(rowShapes(view)).to.deep.equal([['block'], [1, 1], ['tall', 'b'], ['c']]);
  });
});
