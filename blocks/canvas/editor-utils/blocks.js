import { DOMParser as PMDOMParser, NodeSelection } from 'da-y-wrapper';

const NON_BLOCK_TABLE_NAMES = new Set(['metadata', 'section metadata', 'section-metadata']);

export function getTableBlockName(tableNode) {
  const firstRow = tableNode.firstChild;
  if (!firstRow) return '';
  const firstCell = firstRow.firstChild;
  if (!firstCell) return '';
  const raw = firstCell.textContent?.trim() ?? '';
  const match = raw.match(/^([a-zA-Z0-9_\s-]+)(?:\s*\([^)]*\))?$/);
  return match ? match[1].trim().toLowerCase() : raw.toLowerCase();
}

/**
 * Describe the block cell the position sits in: the block (table) name, the row's
 * key cell content (when in a 2-column row's value cell), and the cell's column.
 * Returns null when the position isn't inside a table cell.
 */
export function getTableInfo(state, pos) {
  const $pos = state.doc.resolve(pos);
  let cellDepth = -1;
  for (let d = $pos.depth; d > 0; d -= 1) {
    if ($pos.node(d).type.name === 'table_cell') {
      cellDepth = d;
      break;
    }
  }
  if (cellDepth === -1) return null;

  const rowDepth = cellDepth - 1;
  const table = $pos.node(rowDepth - 1);
  const row = $pos.node(rowDepth);
  const cellIndex = $pos.index(cellDepth - 1);
  const firstRowContent = table.child(0)?.child(0)?.textContent ?? '';
  const match = firstRowContent.match(/^([a-zA-Z0-9_\s-]+)(?:\s*\([^)]*\))?$/);
  if (!match) return null;

  return {
    tableName: match[1].trim(),
    keyValue: (row.childCount > 1 && cellIndex === 1) ? row.child(0).textContent : null,
    isFirstColumn: cellIndex === 0,
    columnsInRow: row.childCount,
  };
}

/** The variant descriptor inside the block header's parentheses, or '' if none. */
export function getTableBlockVariant(tableNode) {
  const firstRow = tableNode?.firstChild;
  const firstCell = firstRow?.firstChild;
  const raw = firstCell?.textContent?.trim() ?? '';
  const match = raw.match(/\(([^)]*)\)\s*$/);
  return match ? match[1].trim() : '';
}

/**
 * Rewrite the selected block's header cell to carry `variant` (e.g. `name (variant)`),
 * or just `name` when `variant` is empty, keeping the block node selected.
 */
export function setTableBlockVariant(view, variant) {
  if (!view) return;
  const { selection } = view.state;
  if (!(selection instanceof NodeSelection)) return;
  const table = selection.node;
  if (table?.type?.name !== 'table') return;
  const para = table.firstChild?.firstChild?.firstChild;
  if (!para) return;
  const tablePos = selection.from;
  // table > row > cell > paragraph: content of the paragraph starts 4 tokens in.
  const from = tablePos + 4;
  const to = from + para.content.size;
  const base = (para.textContent ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  const newText = variant ? `${base} (${variant})` : base;
  const tr = view.state.tr.insertText(newText, from, to);
  tr.setSelection(NodeSelection.create(tr.doc, tablePos));
  view.dispatch(tr);
}

function isSamePosition(from, to, dropPosition) {
  return from === to || (to === from + 1 && dropPosition === 'before')
    || (to === from - 1 && dropPosition === 'after');
}

export function getBlockPositions(view) {
  if (!view?.state?.doc) return [];
  const positions = [];
  const { doc } = view.state;
  doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      const blockName = getTableBlockName(node);
      if (NON_BLOCK_TABLE_NAMES.has(blockName)) return;
      positions.push(pos);
    }
  });
  return positions;
}

export function getActiveBlockIndex(view) {
  if (!view?.state) return -1;
  const { state } = view;
  const cursorPos = state.selection.from;
  const positions = getBlockPositions(view);
  for (let i = 0; i < positions.length; i += 1) {
    const start = positions[i];
    const node = state.doc.nodeAt(start);
    if (node && cursorPos >= start && cursorPos < start + node.nodeSize) return i;
  }
  return -1;
}

// Shared by every single-node move; adjusts insertPos for the shift the delete causes,
// and selects the moved node at its new position.
function spliceNode(view, from, insertPos) {
  const adjustedInsertPos = insertPos > from.pos ? insertPos - from.size : insertPos;
  if (adjustedInsertPos === from.pos) return;
  const tr = view.state.tr
    .delete(from.pos, from.pos + from.size)
    .insert(adjustedInsertPos, from.node);
  tr.setSelection(NodeSelection.create(tr.doc, adjustedInsertPos));
  view.dispatch(tr);
}

export function moveBlock(view, fromIndex, toIndex, dropPosition) {
  if (!view) return;
  if (isSamePosition(fromIndex, toIndex, dropPosition)) return;

  const { doc } = view.state;
  const positions = getBlockPositions(view);

  if (fromIndex >= positions.length || toIndex >= positions.length) return;

  const fromBlockPos = positions[fromIndex];
  const fromBlockNode = doc.nodeAt(fromBlockPos);
  const toBlockPos = positions[toIndex];
  const toBlockNode = doc.nodeAt(toBlockPos);

  if (!fromBlockNode || !toBlockNode) return;

  const insertPos = dropPosition === 'before'
    ? toBlockPos
    : toBlockPos + toBlockNode.nodeSize;

  spliceNode(
    view,
    { pos: fromBlockPos, size: fromBlockNode.nodeSize, node: fromBlockNode },
    insertPos,
  );
}

export function deleteBlock(view, blockIndex) {
  if (!view) return;
  const positions = getBlockPositions(view);
  if (blockIndex < 0 || blockIndex >= positions.length) return;
  const pos = positions[blockIndex];
  const node = view.state.doc.nodeAt(pos);
  if (!node) return;
  view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize));
}

// proseIndex sits inside the node's content, not at its own start; depth-1 recovers
// the whole node regardless of kind or nesting (e.g. a blockquote's nested paragraph).
export function getContentItemRange(doc, child) {
  const pos = doc.resolve(child.proseIndex).before(1);
  const node = doc.nodeAt(pos);
  return node ? { pos, size: node.nodeSize, node } : null;
}

export function deleteContentItem(view, child) {
  if (!view) return;
  const range = getContentItemRange(view.state.doc, child);
  if (!range) return;
  view.dispatch(view.state.tr.delete(range.pos, range.pos + range.size));
}

function getSectionStartOffset(view, sectionIndex) {
  const { doc, schema } = view.state;
  if (sectionIndex === 0) return 0;
  let hrCount = 0;
  let result = doc.content.size;
  doc.forEach((node, offset) => {
    if (node.type === schema.nodes.horizontal_rule) {
      hrCount += 1;
      if (hrCount === sectionIndex) result = offset + node.nodeSize;
    }
  });
  return result;
}

export function insertBlockAtSectionStart(view, dom, sectionIndex) {
  if (!view) return;
  const pos = getSectionStartOffset(view, sectionIndex);
  const parsed = PMDOMParser.fromSchema(view.state.schema).parse(dom);
  view.dispatch(view.state.tr.insert(pos, parsed).scrollIntoView());
}

export function replaceBlockRange(view, from, to, dom) {
  if (!view) return;
  const parsed = PMDOMParser.fromSchema(view.state.schema).parse(dom);
  view.dispatch(view.state.tr.replaceWith(from, to, parsed.content).scrollIntoView());
}

/** Append a copy of `rowDom` (a library <tr>) as a new last row of the table at `tablePos`. */
export function appendBlockRow(view, tablePos, rowDom) {
  if (!view || !rowDom) return;
  const { state } = view;
  const table = state.doc.nodeAt(tablePos);
  if (table?.type?.name !== 'table') return;
  const wrapper = document.createElement('table');
  wrapper.append(rowDom.cloneNode(true));
  const parsed = PMDOMParser.fromSchema(state.schema).parse(wrapper);
  let rowNode = null;
  parsed.descendants((node) => {
    if (rowNode) return false;
    if (node.type.name === 'table_row') {
      rowNode = node;
      return false;
    }
    return true;
  });
  if (!rowNode) return;
  const tr = state.tr.insert(tablePos + table.nodeSize - 1, rowNode);
  tr.setSelection(NodeSelection.create(tr.doc, tablePos));
  view.dispatch(tr.scrollIntoView());
}

export function deleteBlockRow(view, tablePos, rowIndex) {
  if (!view || rowIndex < 1) return false;
  const { state } = view;
  const table = state.doc.nodeAt(tablePos);
  if (table?.type?.name !== 'table' || rowIndex >= table.childCount) return false;
  let from = tablePos + 1;
  for (let i = 0; i < rowIndex; i += 1) from += table.child(i).nodeSize;
  const tr = state.tr.delete(from, from + table.child(rowIndex).nodeSize);
  tr.setSelection(NodeSelection.create(tr.doc, tablePos));
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function moveBlockRow(
  view,
  tablePos,
  fromRowIndex,
  insertionIndex,
) {
  if (!view || fromRowIndex < 1 || insertionIndex < 1) return false;
  const { state } = view;
  const table = state.doc.nodeAt(tablePos);
  if (table?.type?.name !== 'table'
    || fromRowIndex >= table.childCount
    || insertionIndex > table.childCount) return false;

  const rows = [];
  table.forEach((row) => rows.push(row));
  const [row] = rows.splice(fromRowIndex, 1);
  let destinationIndex = insertionIndex;
  if (fromRowIndex < destinationIndex) destinationIndex -= 1;
  if (destinationIndex === fromRowIndex) return false;
  rows.splice(destinationIndex, 0, row);

  const movedTable = table.type.create(table.attrs, rows, table.marks);
  const tr = state.tr.replaceWith(tablePos, tablePos + table.nodeSize, movedTable);
  tr.setSelection(NodeSelection.create(tr.doc, tablePos));
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function deleteSection(view, sectionIndex) {
  if (!view) return;
  const { doc, schema } = view.state;

  const sections = [[]];
  doc.forEach((node) => {
    if (node.type === schema.nodes.horizontal_rule) {
      sections.push([]);
    } else {
      sections[sections.length - 1].push(node);
    }
  });

  if (sectionIndex < 0 || sectionIndex >= sections.length) return;

  const remaining = sections.filter((_, i) => i !== sectionIndex);

  const hrNode = schema.nodes.horizontal_rule.create();
  const newNodes = [];
  remaining.forEach((sectionNodes, i) => {
    if (i > 0) newNodes.push(hrNode);
    newNodes.push(...sectionNodes);
  });

  view.dispatch(view.state.tr.replaceWith(0, doc.content.size, newNodes));
}

export function moveSection(view, fromSectionIndex, toSectionIndex, dropPosition) {
  if (!view) return;
  if (isSamePosition(fromSectionIndex, toSectionIndex, dropPosition)) return;

  const { doc, schema } = view.state;

  const sections = [[]];
  doc.forEach((node) => {
    if (node.type === schema.nodes.horizontal_rule) {
      sections.push([]);
    } else {
      sections[sections.length - 1].push(node);
    }
  });

  if (fromSectionIndex >= sections.length || toSectionIndex >= sections.length) return;

  const reordered = [...sections];
  const [moved] = reordered.splice(fromSectionIndex, 1);
  let insertIdx = dropPosition === 'before' ? toSectionIndex : toSectionIndex + 1;
  if (insertIdx > fromSectionIndex) insertIdx -= 1;
  reordered.splice(insertIdx, 0, moved);

  const hrNode = schema.nodes.horizontal_rule.create();
  const newNodes = [];
  let movedSectionStart;
  reordered.forEach((sectionNodes, i) => {
    if (i > 0) newNodes.push(hrNode);
    if (sectionNodes === moved) {
      movedSectionStart = newNodes.reduce((size, node) => size + node.nodeSize, 0);
    }
    newNodes.push(...sectionNodes);
  });

  const tr = view.state.tr.replaceWith(0, doc.content.size, newNodes);
  if (movedSectionStart != null && moved.length) {
    tr.setSelection(NodeSelection.create(tr.doc, movedSectionStart));
  }
  view.dispatch(tr);
}

// Counterpart to getSectionStartOffset — the hr position bounding the previous section.
function getSectionEndOffset(view, sectionIndex) {
  if (sectionIndex === 0) return 0;
  const { doc, schema } = view.state;
  let hrCount = 0;
  let result = 0;
  doc.forEach((node, offset) => {
    if (node.type === schema.nodes.horizontal_rule) {
      hrCount += 1;
      if (hrCount === sectionIndex) result = offset;
    }
  });
  return result;
}

export function moveContentItem(view, fromChild, target, dropPosition) {
  if (!view) return;
  const { doc } = view.state;
  const from = getContentItemRange(doc, fromChild);
  if (!from) return;

  let insertPos;
  if (target.type === 'content') {
    const to = getContentItemRange(doc, target.child);
    if (!to || to.pos === from.pos) return;
    insertPos = dropPosition === 'before' ? to.pos : to.pos + to.size;
  } else if (target.type === 'block') {
    const positions = getBlockPositions(view);
    if (target.blockIndex >= positions.length) return;
    const toPos = positions[target.blockIndex];
    const toNode = doc.nodeAt(toPos);
    if (!toNode) return;
    insertPos = dropPosition === 'before' ? toPos : toPos + toNode.nodeSize;
  } else if (target.type === 'section') {
    // before the header = last item of the previous section, after = first of this one
    insertPos = dropPosition === 'before'
      ? getSectionEndOffset(view, target.sectionIndex)
      : getSectionStartOffset(view, target.sectionIndex);
  } else {
    return;
  }

  spliceNode(view, from, insertPos);
}

function getBlockRange(view, blockIndex) {
  const { doc } = view.state;
  const positions = getBlockPositions(view);
  if (blockIndex >= positions.length) return null;
  const pos = positions[blockIndex];
  const node = doc.nodeAt(pos);
  return node ? { pos, size: node.nodeSize, node } : null;
}

// Reverse of moveContentItem's 'content' target — a block landing next to a content item.
export function moveBlockToContentItem(view, blockIndex, targetChild, dropPosition) {
  if (!view) return;
  const from = getBlockRange(view, blockIndex);
  if (!from) return;

  const to = getContentItemRange(view.state.doc, targetChild);
  if (!to) return;
  const insertPos = dropPosition === 'before' ? to.pos : to.pos + to.size;

  spliceNode(view, from, insertPos);
}

// Reverse of moveContentItem's 'section' target — a lone block landing at the boundary
// of a section with no blocks to anchor on.
export function moveBlockToSection(view, blockIndex, sectionIndex, dropPosition) {
  if (!view) return;
  const from = getBlockRange(view, blockIndex);
  if (!from) return;

  const insertPos = dropPosition === 'before'
    ? getSectionEndOffset(view, sectionIndex)
    : getSectionStartOffset(view, sectionIndex);

  spliceNode(view, from, insertPos);
}
