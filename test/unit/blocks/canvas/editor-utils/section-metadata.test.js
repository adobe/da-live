import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { setSectionMetadata, getSectionMetadata, getSectionName } from '../../../../../blocks/canvas/editor-utils/blocks.js';
import { makeRealView } from '../test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const NON_BLOCK_TABLE_NAMES = new Set(['metadata', 'section metadata', 'section-metadata']);

function cellJSON(text) {
  return { type: 'table_cell', content: text ? [{ type: 'paragraph', content: [{ type: 'text', text }] }] : [{ type: 'paragraph' }] };
}

function rowJSON(...cells) {
  return { type: 'table_row', content: cells.map(cellJSON) };
}

function metaTableJSON(rows) {
  return { type: 'table', content: [rowJSON('Section Metadata'), ...rows.map((r) => rowJSON(...r))] };
}

function sectionMetadataRows(view, sectionIndex) {
  const { doc, schema } = view.state;
  const sections = [[]];
  doc.forEach((node) => {
    if (node.type === schema.nodes.horizontal_rule) sections.push([]);
    else sections[sections.length - 1].push(node);
  });
  const sectionNodes = sections[sectionIndex] ?? [];
  const table = sectionNodes.find((node) => {
    if (node.type.name !== 'table') return false;
    const name = node.firstChild?.firstChild?.textContent?.trim().toLowerCase();
    return NON_BLOCK_TABLE_NAMES.has(name);
  });
  if (!table) return null;

  const rows = [];
  table.forEach((row, _offset, index) => {
    if (index === 0) return;
    rows.push([row.child(0).textContent, row.child(1)?.textContent ?? '']);
  });
  return rows;
}

describe('setSectionMetadata', () => {
  it('creates a section-metadata block at the section end when absent', () => {
    const view = makeRealView({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    });

    setSectionMetadata(view, 0, 'Style', 'Highlight');

    expect(sectionMetadataRows(view, 0)).to.deep.equal([['Style', 'Highlight']]);
    const metaTable = view.state.doc.lastChild;
    expect(metaTable.type.name).to.equal('table');
    const headerRow = metaTable.firstChild;
    expect(headerRow.childCount).to.equal(1);
    expect(headerRow.firstChild.attrs.colspan).to.equal(2);
    expect(headerRow.firstChild.textContent).to.equal('section-metadata');
  });

  it('updates an existing key in place', () => {
    const view = makeRealView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
        metaTableJSON([['Style', 'Old']]),
      ],
    });

    setSectionMetadata(view, 0, 'Style', 'Highlight');

    expect(sectionMetadataRows(view, 0)).to.deep.equal([['Style', 'Highlight']]);
  });

  it('updates an existing key case-insensitively instead of appending a duplicate', () => {
    const view = makeRealView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
        metaTableJSON([['Style', 'Old']]),
      ],
    });

    setSectionMetadata(view, 0, 'style', 'Highlight');

    expect(sectionMetadataRows(view, 0)).to.deep.equal([['style', 'Highlight']]);
  });

  it('appends a new key without clobbering an existing one', () => {
    const view = makeRealView({
      type: 'doc',
      content: [metaTableJSON([['Style', 'Old']])],
    });

    setSectionMetadata(view, 0, 'Background', 'Dark');

    expect(sectionMetadataRows(view, 0)).to.deep.equal([['Style', 'Old'], ['Background', 'Dark']]);
  });

  it('operates on the targeted section only, leaving others untouched', () => {
    const view = makeRealView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Section 0' }] },
        { type: 'horizontal_rule' },
        { type: 'paragraph', content: [{ type: 'text', text: 'Section 1' }] },
      ],
    });

    setSectionMetadata(view, 1, 'Style', 'Highlight');

    expect(sectionMetadataRows(view, 0)).to.equal(null);
    expect(sectionMetadataRows(view, 1)).to.deep.equal([['Style', 'Highlight']]);
  });
  it('keeps section names when writing', () => {
    const view = makeRealView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'One' }] },
        { type: 'horizontal_rule', attrs: { daSectionName: 'Hero' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'Two' }] },
        { type: 'horizontal_rule', attrs: { daSectionName: 'Footer' } },
        { type: 'paragraph' },
      ],
    });

    setSectionMetadata(view, 1, 'Style', 'dark');
    setSectionMetadata(view, 2, 'Style', 'light');

    expect(getSectionName(view, 1)).to.equal('Hero');
    expect(getSectionName(view, 2)).to.equal('Footer');
    expect(sectionMetadataRows(view, 1)).to.deep.equal([['Style', 'dark']]);
    expect(sectionMetadataRows(view, 2)).to.deep.equal([['Style', 'light']]);
  });

  it('removes a key when set to an empty value, keeping the others', () => {
    const view = makeRealView({
      type: 'doc',
      content: [metaTableJSON([['Style', 'dark'], ['Width', 'full']])],
    });

    setSectionMetadata(view, 0, 'style', '');

    expect(sectionMetadataRows(view, 0)).to.deep.equal([['Width', 'full']]);
  });

  it('removes the section-metadata block when its last key is cleared', () => {
    const view = makeRealView({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }, metaTableJSON([['Style', 'dark']])],
    });

    setSectionMetadata(view, 0, 'Style', '');

    expect(sectionMetadataRows(view, 0)).to.equal(null);
    expect(view.state.doc.childCount).to.equal(1);
  });

  it('does nothing when clearing a key that is not set', () => {
    const view = makeRealView({ type: 'doc', content: [{ type: 'paragraph' }] });
    const before = view.state.doc;
    setSectionMetadata(view, 0, 'Style', '');
    expect(view.state.doc).to.equal(before);
  });

  it('ignores an out-of-range section', () => {
    const view = makeRealView({ type: 'doc', content: [{ type: 'paragraph' }] });
    const before = view.state.doc;
    setSectionMetadata(view, 3, 'Style', 'dark');
    expect(view.state.doc).to.equal(before);
  });
});

describe('getSectionMetadata', () => {
  it('returns {} when the section has no section-metadata table', () => {
    const view = makeRealView({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    });

    expect(getSectionMetadata(view, 0)).to.deep.equal({});
  });

  it('returns normalized-key -> value for each data row, skipping the header row', () => {
    const view = makeRealView({
      type: 'doc',
      content: [metaTableJSON([['Style', 'Highlight'], ['Width', 'Full']])],
    });

    expect(getSectionMetadata(view, 0)).to.deep.equal({ style: 'Highlight', width: 'Full' });
  });

  it('reads only the targeted section', () => {
    const view = makeRealView({
      type: 'doc',
      content: [
        metaTableJSON([['Style', 'Highlight']]),
        { type: 'horizontal_rule' },
        { type: 'paragraph', content: [{ type: 'text', text: 'Section 1' }] },
      ],
    });

    expect(getSectionMetadata(view, 0)).to.deep.equal({ style: 'Highlight' });
    expect(getSectionMetadata(view, 1)).to.deep.equal({});
  });
});
