export function getTableInfo(state, pos) {
  const $pos = state.doc.resolve(pos);
  let tableCellDepth = -1;

  // Search up the tree for a table cell
  for (let d = $pos.depth; d > 0; d -= 1) {
    const node = $pos.node(d);
    if (node.type.name === 'table_cell') {
      tableCellDepth = d;
      break;
    }
  }

  if (tableCellDepth === -1) return null; // not in a table cell

  const rowDepth = tableCellDepth - 1;
  const tableDepth = rowDepth - 1;
  const table = $pos.node(tableDepth);
  const firstRow = table.child(0);
  const cellIndex = $pos.index(tableCellDepth - 1);
  const row = $pos.node(rowDepth);

  const firstRowContent = firstRow.child(0).textContent;
  const tableNameMatch = firstRowContent.match(/^([a-zA-Z0-9_\s-]+)(?:\s*\([^)]*\))?$/);

  if (!tableNameMatch) return null;

  // Only set key value if we're in the second column of a row
  const currentRowFirstColContent = (row.childCount > 1 && cellIndex === 1)
    ? row.child(0).textContent
    : null;

  return {
    tableName: tableNameMatch[1].trim(),
    keyValue: currentRowFirstColContent,
    isFirstColumn: cellIndex === 0,
    columnsInRow: row.childCount,
  };
}

export function isInTableCell(state, pos) {
  const $pos = state.doc.resolve(pos);
  for (let d = $pos.depth; d > 0; d -= 1) {
    if ($pos.node(d).type.name === 'table_cell') {
      return true;
    }
  }
  return false;
}
