import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { makeView } from '../test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { getTableDropPosition, insertDroppedTable } = await import(
  '../../../../../blocks/canvas/ew-editor-wysiwyg/utils/table-drop.js'
);
const { createControllerOnMessage } = await import(
  '../../../../../blocks/canvas/ew-editor-wysiwyg/quick-edit-controller.js'
);

const cell = (text) => ({
  type: 'table_cell',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const table = {
  type: 'table',
  content: [{ type: 'table_row', content: [cell('Cards')] }],
};
const paragraph = (text) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});
const HTML = '<table><tr><td>Hero</td></tr><tr><td>content</td></tr></table>';

function ctx(canWrite = true) {
  const view = makeView({ type: 'doc', content: [paragraph('Before'), table, paragraph('After')] });
  return { view, canWrite };
}

function types(view) {
  const items = [];
  view.state.doc.forEach((node) => items.push(node.type.name));
  return items;
}

describe('quick-edit table insertion', () => {
  it('inserts before or after a text node at the requested boundary', () => {
    const first = ctx();
    const index = 1;
    expect(insertDroppedTable({ html: HTML, anchor: { kind: 'text', index }, side: 'before' }, first))
      .to.equal(true);
    expect(types(first.view)).to.deep.equal(['table', 'paragraph', 'table', 'paragraph']);

    const second = ctx();
    expect(insertDroppedTable({ html: HTML, anchor: { kind: 'text', index }, side: 'after' }, second))
      .to.equal(true);
    expect(types(second.view)).to.deep.equal(['paragraph', 'table', 'table', 'paragraph']);
  });

  it('inserts beside the outer table even if the preview contains nested text', () => {
    const state = ctx();
    const tableIndex = state.view.state.doc.firstChild.nodeSize + 1;
    expect(getTableDropPosition(state.view.state.doc, { kind: 'block', index: tableIndex }, 'after'))
      .to.equal(state.view.state.doc.firstChild.nodeSize + state.view.state.doc.child(1).nodeSize);
    expect(insertDroppedTable({ html: HTML, anchor: { kind: 'block', index: tableIndex }, side: 'after' }, state)).to.equal(true);
    expect(types(state.view)).to.deep.equal(['paragraph', 'table', 'table', 'paragraph']);
  });

  it('climbs from text inside a table to the outermost insertion boundary', () => {
    const state = ctx();
    const tableStart = state.view.state.doc.firstChild.nodeSize;
    const cellParagraphStart = tableStart + 3;
    const index = cellParagraphStart + 1;
    expect(getTableDropPosition(state.view.state.doc, { kind: 'text', index }, 'before'))
      .to.equal(tableStart);
  });

  it('preserves grouped tables with intervening content', () => {
    const state = ctx();
    const html = `<div>${HTML}<p>Between</p>${HTML}</div>`;
    expect(insertDroppedTable({ html, anchor: { kind: 'text', index: 1 }, side: 'before' }, state)).to.equal(true);
    expect(types(state.view).slice(0, 3)).to.deep.equal(['table', 'paragraph', 'table']);
  });

  it('rejects stale positions, invalid HTML, and read-only messages', () => {
    const state = ctx();
    expect(insertDroppedTable({ html: HTML, anchor: { kind: 'block', index: 999 }, side: 'before' }, state)).to.equal(false);
    expect(insertDroppedTable({ html: '<p>No table</p>', anchor: { kind: 'text', index: 1 }, side: 'after' }, state)).to.equal(false);
    expect(insertDroppedTable({ html: HTML, anchor: { kind: 'block', index: 1 }, side: 'after' }, state)).to.equal(false);
    const readOnly = ctx(false);
    createControllerOnMessage(readOnly)({ data: { type: 'table-drop', payload: { html: HTML, anchor: { kind: 'text', index: 1 }, side: 'after' } } });
    expect(types(readOnly.view)).to.deep.equal(['paragraph', 'table', 'paragraph']);
  });
});
