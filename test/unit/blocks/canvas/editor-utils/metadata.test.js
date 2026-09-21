import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { makeRealView } from '../test-helpers.js';
import {
  readMetadataRows,
  ensureMetadataTable,
  addMetadataRow,
  setMetadataValue,
  deleteMetadataRow,
} from '../../../../../blocks/canvas/editor-utils/metadata.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

function metadataTableJSON(rows) {
  const cell = (attrs, text) => ({
    type: 'table_cell',
    attrs,
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
  });
  return {
    type: 'table',
    content: [
      { type: 'table_row', content: [cell({ colspan: 2 }, 'Metadata')] },
      ...rows.map(([key, value]) => ({
        type: 'table_row',
        content: [cell({ colspan: 1 }, key), cell({ colspan: 1 }, value)],
      })),
    ],
  };
}

function findTablePos(view) {
  let pos = -1;
  view.state.doc.descendants((n, p) => { if (n.type.name === 'table' && pos < 0) pos = p; });
  return pos;
}

describe('readMetadataRows', () => {
  it('returns an empty array when there is no view', () => {
    expect(readMetadataRows(null)).to.deep.equal([]);
  });

  it('returns an empty array when the page has no metadata block', () => {
    const view = makeRealView({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] });
    expect(readMetadataRows(view)).to.deep.equal([]);
  });

  it('reads key/value rows directly out of the live doc, skipping the heading row', () => {
    const view = makeRealView({
      type: 'doc',
      content: [metadataTableJSON([['Title', 'My Page'], ['Description', 'A page about things']])],
    });
    expect(readMetadataRows(view)).to.deep.equal([
      { key: 'Title', value: 'My Page' },
      { key: 'Description', value: 'A page about things' },
    ]);
  });
});

describe('ensureMetadataTable', () => {
  it('creates a new metadata table at the end of the doc when none exists', () => {
    const view = makeRealView({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] });
    const pos = ensureMetadataTable(view);
    const table = view.state.doc.nodeAt(pos);
    expect(table.type.name).to.equal('table');
    expect(table.childCount).to.equal(1);
    expect(table.firstChild.textContent).to.equal('Metadata');
  });

  it('returns the position of the existing metadata table without creating a duplicate', () => {
    const view = makeRealView({
      type: 'doc',
      content: [metadataTableJSON([['Title', 'Existing']])],
    });
    const before = findTablePos(view);
    const pos = ensureMetadataTable(view);
    expect(pos).to.equal(before);
    let tableCount = 0;
    view.state.doc.descendants((n) => { if (n.type.name === 'table') tableCount += 1; });
    expect(tableCount).to.equal(1);
  });
});

describe('addMetadataRow', () => {
  it('creates the metadata table and adds the row when none exists yet', () => {
    const view = makeRealView({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] });
    addMetadataRow(view, 'Title', 'My Page');
    const pos = findTablePos(view);
    const table = view.state.doc.nodeAt(pos);
    expect(table.childCount).to.equal(2);
    expect(table.lastChild.textContent).to.equal('TitleMy Page');
  });

  it('appends a new row to an existing metadata table', () => {
    const view = makeRealView({ type: 'doc', content: [metadataTableJSON([['Title', 'My Page']])] });
    addMetadataRow(view, 'Keywords', 'foo, bar');
    const pos = findTablePos(view);
    const table = view.state.doc.nodeAt(pos);
    expect(table.childCount).to.equal(3);
    expect(table.lastChild.textContent).to.equal('Keywordsfoo, bar');
  });
});

describe('setMetadataValue', () => {
  it('updates an existing row value, matching the key case-insensitively', () => {
    const view = makeRealView({
      type: 'doc',
      content: [metadataTableJSON([['Title', 'Old'], ['Description', 'Desc']])],
    });
    setMetadataValue(view, 'title', 'New');
    const pos = findTablePos(view);
    const table = view.state.doc.nodeAt(pos);
    expect(table.child(1).textContent).to.equal('TitleNew');
    expect(table.child(2).textContent).to.equal('DescriptionDesc');
  });

  it('adds a new row when the key does not exist yet', () => {
    const view = makeRealView({ type: 'doc', content: [metadataTableJSON([['Title', 'My Page']])] });
    setMetadataValue(view, 'Keywords', 'foo');
    const pos = findTablePos(view);
    const table = view.state.doc.nodeAt(pos);
    expect(table.childCount).to.equal(3);
    expect(table.lastChild.textContent).to.equal('Keywordsfoo');
  });

  it('creates the metadata table when none exists yet', () => {
    const view = makeRealView({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] });
    setMetadataValue(view, 'Title', 'Brand new');
    const pos = findTablePos(view);
    const table = view.state.doc.nodeAt(pos);
    expect(table.childCount).to.equal(2);
    expect(table.lastChild.textContent).to.equal('TitleBrand new');
  });
});

describe('deleteMetadataRow', () => {
  it('removes the matching row, matched case-insensitively', () => {
    const view = makeRealView({
      type: 'doc',
      content: [metadataTableJSON([['Title', 'My Page'], ['Description', 'Desc']])],
    });
    deleteMetadataRow(view, 'title');
    const pos = findTablePos(view);
    const table = view.state.doc.nodeAt(pos);
    expect(table.childCount).to.equal(2);
    expect(table.child(1).textContent).to.equal('DescriptionDesc');
  });

  it('does nothing when no metadata table exists', () => {
    const view = makeRealView({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] });
    expect(() => deleteMetadataRow(view, 'Title')).to.not.throw();
    let tableCount = 0;
    view.state.doc.descendants((n) => { if (n.type.name === 'table') tableCount += 1; });
    expect(tableCount).to.equal(0);
  });

  it('does nothing when the key does not match any row', () => {
    const view = makeRealView({ type: 'doc', content: [metadataTableJSON([['Title', 'My Page']])] });
    deleteMetadataRow(view, 'Nope');
    const pos = findTablePos(view);
    expect(view.state.doc.nodeAt(pos).childCount).to.equal(2);
  });
});
