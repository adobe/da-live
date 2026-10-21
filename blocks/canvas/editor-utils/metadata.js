import { Fragment, NodeSelection, TextSelection } from 'da-y-wrapper';
import { getTableBlockName } from './blocks.js';

const METADATA_BLOCK_NAME = 'metadata';

function normalizeKey(key) {
  return (key || '').trim().toLowerCase();
}

function textParagraph(schema, text) {
  const { paragraph } = schema.nodes;
  return text ? paragraph.create(null, schema.text(text)) : paragraph.create();
}

function createMetadataHeadingRow(schema) {
  const { table_row: tableRow, table_cell: tableCell } = schema.nodes;
  return tableRow.create(null, Fragment.from(
    tableCell.create({ colspan: 2 }, textParagraph(schema, 'Metadata')),
  ));
}

function createMetadataRow(schema, key, value) {
  const { table_row: tableRow, table_cell: tableCell } = schema.nodes;
  return tableRow.create(null, Fragment.fromArray([
    tableCell.create(null, textParagraph(schema, key)),
    tableCell.create(null, textParagraph(schema, value)),
  ]));
}

function findMetadataTable(view) {
  const { doc } = view.state;
  let result = null;
  doc.descendants((node, pos) => {
    if (result) return false;
    if (node.type.name === 'table' && getTableBlockName(node) === METADATA_BLOCK_NAME) {
      result = { pos, node };
      return false;
    }
    return true;
  });
  return result;
}

// Case-insensitive key match, skipping the heading row.
function findMetadataRow(tableNode, key) {
  const target = normalizeKey(key);
  let result = null;
  tableNode.forEach((row, offset, index) => {
    if (index === 0 || result) return;
    if (normalizeKey(row.firstChild?.textContent) === target) result = { row, offset };
  });
  return result;
}

// The value cell of a row, with its absolute doc position.
function valueCell(tablePos, row, offset) {
  if (row.childCount < 2) return null;
  return { pos: tablePos + 1 + offset + 1 + row.child(0).nodeSize, node: row.child(1) };
}

// First image inside `node`, whose content starts at absolute position `start`.
function findImage(node, start) {
  let found = null;
  node.descendants((child, pos) => {
    if (found) return false;
    if (child.type.name === 'image') {
      found = { pos: start + pos, node: child };
      return false;
    }
    return true;
  });
  return found;
}

/**
 * Read the metadata key/value rows from the live doc. A row whose value cell holds an
 * image also gets `image: { pos, src, alt }`; its text value is then empty.
 */
export function readMetadataRows(view) {
  const found = view ? findMetadataTable(view) : null;
  if (!found) return [];
  const rows = [];
  found.node.forEach((row, offset, index) => {
    if (index === 0) return;
    const key = row.child(0).textContent;
    if (!key.trim()) return;
    const cell = valueCell(found.pos, row, offset);
    const image = cell && findImage(cell.node, cell.pos + 1);
    const entry = { key, value: cell?.node.textContent ?? '' };
    if (image) {
      entry.image = { pos: image.pos, src: image.node.attrs.src, alt: image.node.attrs.alt ?? '' };
    }
    rows.push(entry);
  });
  return rows;
}

function findMetadataValueCell(view, key) {
  const found = findMetadataTable(view);
  const match = found && findMetadataRow(found.node, key);
  return match ? valueCell(found.pos, match.row, match.offset) : null;
}

/** The image in a metadata row's value cell, as `{ pos, node }`, or null. */
export function findMetadataImage(view, key) {
  const cell = view && key?.trim() ? findMetadataValueCell(view, key) : null;
  return cell ? findImage(cell.node, cell.pos + 1) : null;
}

/** Append an empty metadata table if missing; returns its position. */
export function ensureMetadataTable(view) {
  const existing = findMetadataTable(view);
  if (existing) return existing.pos;

  const { schema, doc } = view.state;
  const table = schema.nodes.table.create(null, Fragment.from(createMetadataHeadingRow(schema)));
  const pos = doc.content.size;
  view.dispatch(view.state.tr.insert(pos, table));
  return pos;
}

// Title, then Description, then the rest in their existing order.
function canonicalRowOrder(rows) {
  const titleRow = rows.find((r) => normalizeKey(r.child(0).textContent) === 'title');
  const descRow = rows.find((r) => normalizeKey(r.child(0).textContent) === 'description');
  const others = rows.filter((r) => r !== titleRow && r !== descRow);
  return [titleRow, descRow, ...others].filter(Boolean);
}

function replaceTableRows(view, tablePos, table, rows) {
  const newTable = view.state.schema.nodes.table.create(table.attrs, [table.child(0), ...rows]);
  view.dispatch(view.state.tr.replaceWith(tablePos, tablePos + table.nodeSize, newTable));
}

export function addMetadataRow(view, key, value) {
  if (!view || !key?.trim()) return;
  const tablePos = ensureMetadataTable(view);
  const { state } = view;
  const table = state.doc.nodeAt(tablePos);
  const newRow = createMetadataRow(state.schema, key.trim(), value ?? '');
  const rows = [];
  table.forEach((row, offset, index) => { if (index > 0) rows.push(row); });
  rows.push(newRow);
  replaceTableRows(view, tablePos, table, canonicalRowOrder(rows));
}

export function setMetadataValue(view, key, value) {
  if (!view || !key?.trim()) return;
  const tablePos = ensureMetadataTable(view);
  const table = view.state.doc.nodeAt(tablePos);
  const match = findMetadataRow(table, key);
  if (!match) {
    addMetadataRow(view, key, value);
    return;
  }
  const { row: targetRow } = match;
  const newRow = createMetadataRow(view.state.schema, targetRow.firstChild?.textContent ?? key, value ?? '');
  const rows = [];
  table.forEach((row, offset, index) => {
    if (index === 0) return;
    rows.push(row === targetRow ? newRow : row);
  });
  replaceTableRows(view, tablePos, table, canonicalRowOrder(rows));
}

export function deleteMetadataRow(view, key) {
  if (!view) return;
  const found = findMetadataTable(view);
  if (!found) return;
  const match = findMetadataRow(found.node, key);
  if (!match) return;

  // Last row: remove the whole block.
  if (found.node.childCount <= 2) {
    view.dispatch(view.state.tr.delete(found.pos, found.pos + found.node.nodeSize));
    return;
  }

  const { row, offset } = match;
  const rowPos = found.pos + 1 + offset;
  view.dispatch(view.state.tr.delete(rowPos, rowPos + row.nodeSize));
}

function ensureMetadataValueCell(view, key) {
  if (!findMetadataValueCell(view, key)) addMetadataRow(view, key, '');
  return findMetadataValueCell(view, key);
}

/**
 * Put an image into a metadata row, adding the row when missing. An existing image keeps
 * its other attributes; otherwise the cell's content is replaced by the image.
 */
export function setMetadataImage(view, key, { src, alt } = {}) {
  if (!view || !key?.trim() || !src) return;
  const image = findMetadataImage(view, key);
  if (image) {
    const attrs = { ...image.node.attrs, src, ...(alt !== undefined ? { alt } : {}) };
    view.dispatch(view.state.tr.setNodeMarkup(image.pos, null, attrs));
    return;
  }
  const cell = ensureMetadataValueCell(view, key);
  const { schema } = view.state;
  const node = schema.nodes.image.create({ src, ...(alt ? { alt } : {}) });
  const paragraph = schema.nodes.paragraph.create(null, node);
  const end = cell.pos + cell.node.nodeSize - 1;
  view.dispatch(view.state.tr.replaceWith(cell.pos + 1, end, paragraph));
}

/**
 * Select where an inserted image should go: the row's existing image, or else the text of
 * its value cell (adding the row when missing). Asset pickers insert at the selection.
 */
export function selectMetadataImageTarget(view, key) {
  if (!view || !key?.trim()) return false;
  const image = findMetadataImage(view, key);
  if (image) {
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, image.pos)));
    return true;
  }
  const cell = ensureMetadataValueCell(view, key);
  const { doc } = view.state;
  const block = cell.node.firstChild;
  const selection = block?.isTextblock
    ? TextSelection.create(doc, cell.pos + 2, cell.pos + 2 + block.content.size)
    : TextSelection.near(doc.resolve(cell.pos + 1));
  view.dispatch(view.state.tr.setSelection(selection));
  return true;
}
