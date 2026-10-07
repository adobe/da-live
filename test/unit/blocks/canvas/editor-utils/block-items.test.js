import { expect } from '@esm-bundle/chai';
import { EditorState, NodeSelection } from 'da-y-wrapper';
import { history, undo, redo } from 'prosemirror-history';
import { makeView } from '../test-helpers.js';
import { appendBlockRow, deleteBlockRow, moveBlockRow } from '../../../../../blocks/canvas/editor-utils/blocks.js';

function block() {
  const cell = (text, attrs = {}, marks = []) => ({
    type: 'table_cell',
    attrs,
    content: [{ type: 'paragraph', content: [{ type: 'text', text, marks }] }],
  });
  return {
    type: 'table',
    content: [
      { type: 'table_row', content: [cell('Hero (dark)', { colspan: 2 })] },
      ...['First', 'Second', 'Third'].map((text) => ({
        type: 'table_row',
        content: [cell(text, {}, [{ type: 'strong' }]), cell(`${text} details`)],
      })),
    ],
  };
}

describe('block item row transactions', () => {
  let view;
  let tablePos;

  beforeEach(() => {
    const base = makeView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
        block(),
        { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
      ],
    });
    const { schema, doc } = base.state;
    let state = EditorState.create({ schema, doc, plugins: [history()] });
    view = {
      get state() { return state; },
      dispatch(tr) { state = state.apply(tr); },
    };
    tablePos = state.doc.firstChild.nodeSize;
    view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, tablePos)));
  });

  function rowNames() {
    const table = view.state.doc.nodeAt(tablePos);
    return Array.from(
      { length: table.childCount - 1 },
      (_, i) => table.child(i + 1).firstChild.textContent,
    );
  }

  function expectBlockSelected() {
    expect(view.state.selection).to.be.instanceOf(NodeSelection);
    expect(view.state.selection.from).to.equal(tablePos);
    expect(view.state.selection.node.firstChild.textContent).to.equal('Hero (dark)');
    expect(view.state.doc.firstChild.textContent).to.equal('Before');
    expect(view.state.doc.lastChild.textContent).to.equal('After');
  }

  it('moves an item down without changing its cells, marks or the header', () => {
    const table = view.state.doc.nodeAt(tablePos);
    const header = table.firstChild;
    const row = table.child(1);
    moveBlockRow(view, tablePos, 1, 3);
    expect(rowNames()).to.deep.equal(['Second', 'Third', 'First']);
    expect(view.state.selection.node.firstChild).to.equal(header);
    expect(view.state.selection.node.child(3)).to.equal(row);
    expectBlockSelected();
  });

  it('moves an item up', () => {
    moveBlockRow(view, tablePos, 3, 1);
    expect(rowNames()).to.deep.equal(['Third', 'First', 'Second']);
    expectBlockSelected();
  });

  it('deletes only the specified item row', () => {
    const table = view.state.doc.nodeAt(tablePos);
    deleteBlockRow(view, tablePos, 2);
    expect(rowNames()).to.deep.equal(['First', 'Third']);
    expect(view.state.selection.node.child(1)).to.equal(table.child(1));
    expect(view.state.selection.node.child(2)).to.equal(table.child(3));
    expectBlockSelected();
  });

  it('allows deleting all items while retaining the block header', () => {
    for (let i = 0; i < 3; i += 1) deleteBlockRow(view, tablePos, 1);
    expect(rowNames()).to.deep.equal([]);
    expect(view.state.selection.node.childCount).to.equal(1);
    expect(view.state.selection.node.firstChild.firstChild.attrs.colspan).to.equal(2);
    expectBlockSelected();
  });

  it('never moves or deletes the header or an out-of-range row', () => {
    const { doc } = view.state;
    for (const index of [-1, 0, 4, 1.5]) {
      deleteBlockRow(view, tablePos, index);
      moveBlockRow(view, tablePos, index, 1);
      moveBlockRow(view, tablePos, 1, index);
    }
    moveBlockRow(view, tablePos, 1, 1);
    expect(view.state.doc).to.equal(doc);
  });

  it('supports undo and redo for a reorder', () => {
    const { doc } = view.state;
    moveBlockRow(view, tablePos, 1, 3);
    expect(undo(view.state, (tr) => view.dispatch(tr))).to.be.true;
    expect(view.state.doc.eq(doc)).to.be.true;
    expect(redo(view.state, (tr) => view.dispatch(tr))).to.be.true;
    expect(rowNames()).to.deep.equal(['Second', 'Third', 'First']);
  });

  it('supports undo and redo for deletion', () => {
    const { doc } = view.state;
    deleteBlockRow(view, tablePos, 2);
    expect(undo(view.state, (tr) => view.dispatch(tr))).to.be.true;
    expect(view.state.doc.eq(doc)).to.be.true;
    expect(redo(view.state, (tr) => view.dispatch(tr))).to.be.true;
    expect(rowNames()).to.deep.equal(['First', 'Third']);
  });

  it('adds a cloned template row and supports undo', () => {
    const { doc } = view.state;
    const template = document.createElement('table');
    template.innerHTML = '<tr><td>New item</td><td>New details</td></tr>';
    const row = template.rows[0];
    appendBlockRow(view, tablePos, row);
    expect(rowNames()).to.deep.equal(['First', 'Second', 'Third', 'New item']);
    expect(view.state.selection.node.lastChild.child(1).textContent).to.equal('New details');
    expect(template.rows[0]).to.equal(row);
    expectBlockSelected();
    expect(undo(view.state, (tr) => view.dispatch(tr))).to.be.true;
    expect(view.state.doc.eq(doc)).to.be.true;
  });
});
