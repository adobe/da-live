import { NodeSelection } from 'da-y-wrapper';

/**
 * Position math for a single-column-of-rows block table (schema: table > table_row >
 * table_cell > paragraph). `tablePos` is the table node's own position (e.g. a
 * NodeSelection.from, or a NodeView's getPos()) — i.e. `doc.nodeAt(tablePos) === table`.
 *
 * Position arithmetic: a node's own position + 1 enters its content (first child's own
 * position); summing preceding siblings' nodeSize walks across a row/table's children.
 * table+1 -> row0; row+1 -> cell0; cell+1 -> paragraph; paragraph+1 -> text content.
 */
export function getCellRange(tableNode, tablePos, rowIndex, cellIndex) {
  const row = tableNode.child(rowIndex);
  let rowStart = tablePos + 1;
  for (let r = 0; r < rowIndex; r += 1) rowStart += tableNode.child(r).nodeSize;

  const cell = row.child(cellIndex);
  let cellStart = rowStart + 1;
  for (let c = 0; c < cellIndex; c += 1) cellStart += row.child(c).nodeSize;

  return {
    cell,
    cellStart,
    contentFrom: cellStart + 1,
    contentTo: cellStart + cell.nodeSize - 1,
  };
}

export function getCellContentRange(
  tableNode,
  tablePos,
  rowIndex,
  cellIndex,
  contentIndex,
) {
  const { cell, contentFrom } = getCellRange(tableNode, tablePos, rowIndex, cellIndex);
  const node = cell.child(contentIndex);
  let from = contentFrom;
  for (let i = 0; i < contentIndex; i += 1) from += cell.child(i).nodeSize;
  return { node, from, to: from + node.nodeSize };
}

/** Every (rowIndex, cellIndex) cell in the table, in document order. */
export function collectCells(tableNode) {
  const cells = [];
  for (let r = 0; r < tableNode.childCount; r += 1) {
    const row = tableNode.child(r);
    for (let c = 0; c < row.childCount; c += 1) {
      cells.push({ rowIndex: r, cellIndex: c, cell: row.child(c) });
    }
  }
  return cells;
}

/** The single image node directly inside a cell's content, or null. */
export function cellImageNode(cell) {
  if (cell.childCount !== 1) return null;
  const child = cell.firstChild;
  if (child.type.name === 'image') return child;
  if (child.type.name === 'paragraph' && child.childCount === 1 && child.firstChild.type.name === 'image') {
    return child.firstChild;
  }
  return null;
}

export function getCellImagePosition(tableNode, tablePos, rowIndex, cellIndex) {
  const { cell, cellStart } = getCellRange(tableNode, tablePos, rowIndex, cellIndex);
  const image = cellImageNode(cell);
  if (!image) return null;
  return cell.firstChild === image ? cellStart + 1 : cellStart + 2;
}

export function getCellContentImagePosition(
  tableNode,
  tablePos,
  rowIndex,
  cellIndex,
  contentIndex,
) {
  const { node, from } = getCellContentRange(
    tableNode,
    tablePos,
    rowIndex,
    cellIndex,
    contentIndex,
  );
  if (node.type.name === 'image') return from;
  if (node.childCount === 1 && node.firstChild.type.name === 'image') return from + 1;
  return null;
}

/**
 * Replace a cell's complete block content, keeping the table selected.
 */
export function replaceCellContent(view, tablePos, rowIndex, cellIndex, content) {
  if (!view) return false;
  const table = view.state.doc.nodeAt(tablePos);
  if (!table || table.type.name !== 'table') return false;
  const { contentFrom, contentTo } = getCellRange(
    table,
    tablePos,
    rowIndex,
    cellIndex,
  );
  const tr = view.state.tr.replaceWith(contentFrom, contentTo, content);
  tr.setSelection(NodeSelection.create(tr.doc, tablePos));
  view.dispatch(tr);
  return true;
}

export function replaceCellContentNode(
  view,
  tablePos,
  rowIndex,
  cellIndex,
  contentIndex,
  content,
) {
  if (!view) return false;
  const table = view.state.doc.nodeAt(tablePos);
  if (!table || table.type.name !== 'table') return false;
  const { from, to } = getCellContentRange(
    table,
    tablePos,
    rowIndex,
    cellIndex,
    contentIndex,
  );
  const tr = view.state.tr.replaceWith(from, to, content);
  tr.setSelection(NodeSelection.create(tr.doc, tablePos));
  view.dispatch(tr);
  return true;
}
