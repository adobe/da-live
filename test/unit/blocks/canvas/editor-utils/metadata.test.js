import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { makeRealView } from '../test-helpers.js';
import {
  readMetadataRows,
  ensureMetadataTable,
  addMetadataRow,
  setMetadataValue,
  deleteMetadataRow,
  findMetadataImage,
  findMetadataValueCell,
  setMetadataImage,
  selectMetadataImageTarget,
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

function rowKeys(table) {
  const keys = [];
  table.forEach((row, offset, index) => {
    if (index === 0) return;
    keys.push(row.child(0).textContent);
  });
  return keys;
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

  it('skips rows with a blank key, e.g. a freshly-added empty table row', () => {
    const view = makeRealView({
      type: 'doc',
      content: [metadataTableJSON([['Title', 'My Page'], ['', ''], ['  ', 'orphan value']])],
    });
    expect(readMetadataRows(view)).to.deep.equal([{ key: 'Title', value: 'My Page' }]);
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

  it('moves Title to the front when added after other fields already exist', () => {
    const view = makeRealView({ type: 'doc', content: [metadataTableJSON([['Category', 'News']])] });
    addMetadataRow(view, 'Title', 'My Page');
    const table = view.state.doc.nodeAt(findTablePos(view));
    expect(rowKeys(table)).to.deep.equal(['Title', 'Category']);
  });

  it('places Description right after Title, ahead of other fields, when added later', () => {
    const view = makeRealView({
      type: 'doc',
      content: [metadataTableJSON([['Title', 'My Page'], ['Category', 'News']])],
    });
    addMetadataRow(view, 'Description', 'A page about things');
    const table = view.state.doc.nodeAt(findTablePos(view));
    expect(rowKeys(table)).to.deep.equal(['Title', 'Description', 'Category']);
  });

  it('preserves the relative order of non-Title/Description fields', () => {
    const view = makeRealView({
      type: 'doc',
      content: [metadataTableJSON([['Category', 'News'], ['Title', 'My Page']])],
    });
    addMetadataRow(view, 'Robots', 'noindex');
    const table = view.state.doc.nodeAt(findTablePos(view));
    expect(rowKeys(table)).to.deep.equal(['Title', 'Category', 'Robots']);
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

  it('reorders Title/Description to the front even when only an unrelated field is updated', () => {
    const view = makeRealView({
      type: 'doc',
      content: [metadataTableJSON([['Category', 'News'], ['Description', 'Desc'], ['Title', 'My Page']])],
    });
    setMetadataValue(view, 'Category', 'Blog');
    const table = view.state.doc.nodeAt(findTablePos(view));
    expect(rowKeys(table)).to.deep.equal(['Title', 'Description', 'Category']);
    expect(table.child(3).textContent).to.equal('CategoryBlog');
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

  it('removes the entire metadata table when deleting its last row', () => {
    const view = makeRealView({ type: 'doc', content: [metadataTableJSON([['Title', 'My Page']])] });
    deleteMetadataRow(view, 'Title');
    expect(findTablePos(view)).to.equal(-1);
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

// A metadata row whose value cell holds an image, the way DA stores og:image style rows.
function imageRowJSON(key, attrs) {
  const keyCell = { type: 'table_cell', attrs: { colspan: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: key }] }] };
  const valueCell = { type: 'table_cell', attrs: { colspan: 1 }, content: [{ type: 'paragraph', content: [{ type: 'image', attrs }] }] };
  return { type: 'table_row', content: [keyCell, valueCell] };
}

function docWithImageRow(rows, key = 'Image', attrs = { src: '/current.png', alt: 'Current alt' }) {
  const table = metadataTableJSON(rows);
  table.content.push(imageRowJSON(key, attrs));
  return { type: 'doc', content: [table] };
}

describe('metadata image rows', () => {
  it('reads an image row with its position, src and alt, leaving text rows unchanged', () => {
    const view = makeRealView(docWithImageRow([['Title', 'My Page']]));
    const [title, image] = readMetadataRows(view);
    expect(title).to.deep.equal({ key: 'Title', value: 'My Page' });
    expect(image).to.deep.include({ key: 'Image', value: '' });
    expect(image.image).to.deep.include({ src: '/current.png', alt: 'Current alt' });
    expect(view.state.doc.nodeAt(image.image.pos).type.name).to.equal('image');
  });

  it('finds the image in a row case-insensitively, or nothing for text rows and missing rows', () => {
    const view = makeRealView(docWithImageRow([['Title', 'My Page']]));
    const found = findMetadataImage(view, 'image');
    expect(found.node.attrs.src).to.equal('/current.png');
    expect(view.state.doc.nodeAt(found.pos)).to.equal(found.node);
    expect(findMetadataImage(view, 'Title')).to.equal(null);
    expect(findMetadataImage(view, 'Nope')).to.equal(null);
    expect(findMetadataImage(null, 'Image')).to.equal(null);
  });

  it('finds a row value cell case-insensitively, with its doc position', () => {
    const view = makeRealView(docWithImageRow([['Title', 'My Page']]));
    const title = findMetadataValueCell(view, 'title');
    expect(title.node.type.name).to.equal('table_cell');
    expect(title.node.textContent).to.equal('My Page');
    expect(view.state.doc.nodeAt(title.pos)).to.equal(title.node);
    const image = findMetadataValueCell(view, 'IMAGE');
    expect(view.state.doc.nodeAt(image.pos)).to.equal(image.node);
    expect(image.node.firstChild.firstChild.type.name).to.equal('image');
  });

  it('finds no value cell for a missing row or a page without metadata', () => {
    expect(findMetadataValueCell(makeRealView(docWithImageRow([])), 'Title')).to.equal(null);
    const plain = makeRealView({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(findMetadataValueCell(plain, 'Title')).to.equal(null);
  });

  it('keeps an unchanged value cell as the same node across edits to other rows', () => {
    const view = makeRealView(docWithImageRow([['Title', 'My Page']]));
    const before = findMetadataValueCell(view, 'Image').node;
    setMetadataValue(view, 'Title', 'Renamed');
    expect(findMetadataValueCell(view, 'Image').node).to.equal(before);
    setMetadataImage(view, 'Image', { src: './media_new.png' });
    expect(findMetadataValueCell(view, 'Image').node).not.to.equal(before);
  });

  it('replaces only the src of an existing image, keeping its other attributes', () => {
    const view = makeRealView(docWithImageRow([['Title', 'My Page']]));
    setMetadataImage(view, 'Image', { src: './media_new.png' });
    const { node } = findMetadataImage(view, 'Image');
    expect(node.attrs.src).to.equal('./media_new.png');
    expect(node.attrs.alt).to.equal('Current alt');
    expect(readMetadataRows(view)[0]).to.deep.equal({ key: 'Title', value: 'My Page' });
  });

  it('puts an image into an existing text row, replacing its text', () => {
    const view = makeRealView({ type: 'doc', content: [metadataTableJSON([['Image', 'old text']])] });
    setMetadataImage(view, 'Image', { src: './media_new.png', alt: 'New alt' });
    const [row] = readMetadataRows(view);
    expect(row.value).to.equal('');
    expect(row.image).to.deep.include({ src: './media_new.png', alt: 'New alt' });
  });

  it('adds a missing row (and table) for a new image', () => {
    const view = makeRealView({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] });
    setMetadataImage(view, 'Image', { src: './media_new.png' });
    const [row] = readMetadataRows(view);
    expect(row.key).to.equal('Image');
    expect(row.image.src).to.equal('./media_new.png');
  });

  it('selects the existing image so an inserted asset replaces it', () => {
    const view = makeRealView(docWithImageRow([['Title', 'My Page']]));
    expect(selectMetadataImageTarget(view, 'Image')).to.equal(true);
    const { selection } = view.state;
    expect(selection.node?.type.name).to.equal('image');
    expect(selection.from).to.equal(findMetadataImage(view, 'Image').pos);
  });

  it('selects the value text, creating the row when missing, so an inserted asset fills it', () => {
    const view = makeRealView({ type: 'doc', content: [metadataTableJSON([['Image', 'old text']])] });
    expect(selectMetadataImageTarget(view, 'Image')).to.equal(true);
    const { from, to } = view.state.selection;
    expect(view.state.doc.textBetween(from, to)).to.equal('old text');

    const empty = makeRealView({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(selectMetadataImageTarget(empty, 'Image')).to.equal(true);
    expect(readMetadataRows(empty)).to.deep.equal([{ key: 'Image', value: '' }]);
    const { $from } = empty.state.selection;
    expect($from.parent.type.name).to.equal('paragraph');
    expect($from.node($from.depth - 1).type.name).to.equal('table_cell');
    expect(selectMetadataImageTarget(null, 'Image')).to.equal(false);
  });
});
