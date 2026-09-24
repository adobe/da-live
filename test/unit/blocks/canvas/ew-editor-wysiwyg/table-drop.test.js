import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { makeView } from '../test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { getTableDropPosition, insertDroppedHtml } = await import(
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

describe('quick-edit HTML insertion', () => {
  it('inserts before or after a text node at the requested boundary', () => {
    const first = ctx();
    const index = 1;
    expect(insertDroppedHtml({ html: HTML, anchor: { kind: 'text', index }, side: 'before' }, first))
      .to.equal(true);
    expect(types(first.view)).to.deep.equal(['table', 'paragraph', 'table', 'paragraph']);

    const second = ctx();
    expect(insertDroppedHtml({ html: HTML, anchor: { kind: 'text', index }, side: 'after' }, second))
      .to.equal(true);
    expect(types(second.view)).to.deep.equal(['paragraph', 'table', 'table', 'paragraph']);
  });

  it('inserts beside the outer table even if the preview contains nested text', () => {
    const state = ctx();
    const tableIndex = state.view.state.doc.firstChild.nodeSize + 1;
    expect(getTableDropPosition(state.view.state.doc, { kind: 'block', index: tableIndex }, 'after'))
      .to.equal(state.view.state.doc.firstChild.nodeSize + state.view.state.doc.child(1).nodeSize);
    expect(insertDroppedHtml({ html: HTML, anchor: { kind: 'block', index: tableIndex }, side: 'after' }, state)).to.equal(true);
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
    expect(insertDroppedHtml({ html, anchor: { kind: 'text', index: 1 }, side: 'before' }, state)).to.equal(true);
    expect(types(state.view).slice(0, 3)).to.deep.equal(['table', 'paragraph', 'table']);
  });

  it('inserts headings and paragraphs at block boundaries with their sample content', () => {
    const state = ctx();
    expect(insertDroppedHtml({
      html: '<h2>Heading</h2><p>Paragraph</p>',
      anchor: { kind: 'text', index: 1 },
      side: 'before',
    }, state)).to.equal(true);
    expect(types(state.view).slice(0, 4)).to.deep.equal([
      'heading', 'paragraph', 'paragraph', 'table',
    ]);
    expect(state.view.state.doc.firstChild.attrs.level).to.equal(2);
    expect(state.view.state.doc.firstChild.textContent).to.equal('Heading');
    expect(state.view.state.doc.child(1).textContent).to.equal('Paragraph');
  });

  it('accepts all six supported heading levels', () => {
    for (let level = 1; level <= 6; level += 1) {
      const state = ctx();
      expect(insertDroppedHtml({
        html: `<h${level}>Heading</h${level}>`,
        anchor: { kind: 'text', index: 1 },
        side: 'before',
      }, state)).to.equal(true);
      expect(state.view.state.doc.firstChild.attrs.level).to.equal(level);
    }
  });

  it('rejects stale positions, empty HTML, and read-only messages', () => {
    const state = ctx();
    expect(insertDroppedHtml({ html: HTML, anchor: { kind: 'block', index: 999 }, side: 'before' }, state)).to.equal(false);
    expect(insertDroppedHtml({ html: '', anchor: { kind: 'text', index: 1 }, side: 'after' }, state)).to.equal(false);
    expect(insertDroppedHtml({ html: HTML, anchor: { kind: 'block', index: 1 }, side: 'after' }, state)).to.equal(false);
    const readOnly = ctx(false);
    createControllerOnMessage(readOnly)({ data: { type: 'table-drop', payload: { html: '<h2>Heading</h2>', anchor: { kind: 'text', index: 1 }, side: 'after' } } });
    expect(types(readOnly.view)).to.deep.equal(['paragraph', 'table', 'paragraph']);
  });
});
