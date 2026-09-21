import { Fragment } from 'da-y-wrapper';
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

// Skips the heading row (index 0); matches on the row's key cell, case-insensitively.
function findMetadataRow(tableNode, key) {
  const target = normalizeKey(key);
  let result = null;
  tableNode.forEach((row, offset, index) => {
    if (index === 0 || result) return;
    if (normalizeKey(row.firstChild?.textContent) === target) result = { row, offset };
  });
  return result;
}

/**
 * Read the page's current metadata rows straight from the live doc — more robust than
 * parsing rendered aemHtml, which depends on the real editor's table-wrapper plugins
 * and only reflects whatever the last html-state emission happened to capture.
 */
export function readMetadataRows(view) {
  const found = view ? findMetadataTable(view) : null;
  if (!found) return [];
  const rows = [];
  found.node.forEach((row, offset, index) => {
    if (index === 0) return;
    const key = row.child(0).textContent;
    if (!key.trim()) return;
    rows.push({ key, value: row.child(1).textContent });
  });
  return rows;
}

/** Insert an empty metadata table at the end of the doc if one is missing. Returns its position. */
export function ensureMetadataTable(view) {
  const existing = findMetadataTable(view);
  if (existing) return existing.pos;

  const { schema, doc } = view.state;
  const table = schema.nodes.table.create(null, Fragment.from(createMetadataHeadingRow(schema)));
  const pos = doc.content.size;
  view.dispatch(view.state.tr.insert(pos, table));
  return pos;
}

export function addMetadataRow(view, key, value) {
  if (!view || !key?.trim()) return;
  const tablePos = ensureMetadataTable(view);
  const { state } = view;
  const table = state.doc.nodeAt(tablePos);
  const row = createMetadataRow(state.schema, key.trim(), value ?? '');
  view.dispatch(state.tr.insert(tablePos + table.nodeSize - 1, row));
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
  const { row, offset } = match;
  const rowPos = tablePos + 1 + offset;
  const newRow = createMetadataRow(view.state.schema, row.firstChild?.textContent ?? key, value ?? '');
  view.dispatch(view.state.tr.replaceWith(rowPos, rowPos + row.nodeSize, newRow));
}

export function deleteMetadataRow(view, key) {
  if (!view) return;
  const found = findMetadataTable(view);
  if (!found) return;
  const match = findMetadataRow(found.node, key);
  if (!match) return;
  const { row, offset } = match;
  const rowPos = found.pos + 1 + offset;
  view.dispatch(view.state.tr.delete(rowPos, rowPos + row.nodeSize));
}
