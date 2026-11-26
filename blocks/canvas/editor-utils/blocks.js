import { DOMParser as PMDOMParser, NodeSelection, TextSelection } from 'da-y-wrapper';
import { getFirstSectionName, setFirstSectionName } from '../../shared/section-name.js';

export const MAX_SECTION_NAME = 100;

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

/**
 * Map a doc position to the block it sits in and a block operator position:
 * `{ blockIndex, position: { row, cell, textOffset } }`. `row` excludes the header row;
 * `position` is null when `pos` is in the header row or not inside a cell (e.g. the
 * whole block is selected). Returns null when `pos` is outside every block.
 */
export function resolveBlockPosition(view, pos = view?.state?.selection?.from) {
  if (!view?.state || typeof pos !== 'number') return null;
  const { doc } = view.state;
  const positions = getBlockPositions(view);
  const blockIndex = positions.findIndex((start) => (
    pos > start && pos < start + doc.nodeAt(start).nodeSize
  ));
  if (blockIndex === -1) return null;
  const start = positions[blockIndex];
  const $pos = doc.resolve(pos);
  let tableDepth = -1;
  for (let d = $pos.depth; d > 0; d -= 1) {
    if ($pos.before(d) === start) {
      tableDepth = d;
      break;
    }
  }
  if (tableDepth === -1 || $pos.depth < tableDepth + 2) return { blockIndex, position: null };
  const rowIndex = $pos.index(tableDepth);
  if (rowIndex === 0) return { blockIndex, position: null };
  const cellStart = $pos.start(tableDepth + 2);
  return {
    blockIndex,
    position: {
      row: rowIndex - 1,
      cell: $pos.index(tableDepth + 1),
      textOffset: doc.textBetween(cellStart, pos, '', '').length,
    },
  };
}

/** Inverse of resolveBlockPosition: the doc position of a block operator position, or null. */
export function blockPositionToPos(view, blockIndex, position) {
  if (!view?.state) return null;
  const { row, cell, textOffset } = position ?? {};
  if (!Number.isInteger(row) || !Number.isInteger(cell) || row < 0 || cell < 0) return null;
  const { doc } = view.state;
  const start = getBlockPositions(view)[blockIndex];
  if (start == null) return null;
  const table = doc.nodeAt(start);
  const rowNode = table.maybeChild(row + 1);
  const cellNode = rowNode?.maybeChild(cell);
  if (!cellNode) return null;
  let cellPos = start + 1;
  for (let r = 0; r <= row; r += 1) cellPos += table.child(r).nodeSize;
  cellPos += 1;
  for (let c = 0; c < cell; c += 1) cellPos += rowNode.child(c).nodeSize;
  const contentStart = cellPos + 1;

  let remaining = Number.isInteger(textOffset) && textOffset > 0 ? textOffset : 0;
  let result = null;
  let firstTextblock = null;
  let lastTextEnd = null;
  cellNode.descendants((node, offset) => {
    if (result != null) return false;
    const abs = contentStart + offset;
    if (node.isTextblock && firstTextblock == null) firstTextblock = abs + 1;
    if (node.isText) {
      if (remaining <= node.text.length) {
        result = abs + remaining;
        return false;
      }
      remaining -= node.text.length;
      lastTextEnd = abs + node.text.length;
    }
    return true;
  });
  return result ?? lastTextEnd ?? firstTextblock ?? contentStart;
}

/** Put a caret at a block operator position. Returns whether the position resolved. */
export function setBlockSelection(view, blockIndex, position) {
  const pos = blockPositionToPos(view, blockIndex, position);
  if (pos == null) return false;
  const sel = TextSelection.near(view.state.doc.resolve(pos));
  view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
  return true;
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

function splitSections(view) {
  const { doc, schema } = view.state;
  const groups = [[]];
  const names = [getFirstSectionName()];
  doc.forEach((node) => {
    if (node.type === schema.nodes.horizontal_rule) {
      groups.push([]);
      names.push(node.attrs.daSectionName ?? null);
    } else {
      groups[groups.length - 1].push(node);
    }
  });
  return { groups, names };
}

function rebuildSections(view, groups, names) {
  const { doc, schema } = view.state;
  const nodes = [];
  const starts = [];
  groups.forEach((sectionNodes, i) => {
    if (i > 0) nodes.push(schema.nodes.horizontal_rule.create({ daSectionName: names[i] }));
    starts.push(nodes.reduce((size, node) => size + node.nodeSize, 0));
    nodes.push(...sectionNodes);
  });
  return { tr: view.state.tr.replaceWith(0, doc.content.size, nodes), starts };
}

export function setSectionName(view, sectionIndex, name) {
  if (!view) return;
  const { doc, schema } = view.state;
  const daSectionName = name?.trim().slice(0, MAX_SECTION_NAME) || null;

  if (sectionIndex === 0) {
    setFirstSectionName(daSectionName);
    return;
  }

  let hrCount = 0;
  let hrPos;
  doc.forEach((node, offset) => {
    if (node.type === schema.nodes.horizontal_rule) {
      hrCount += 1;
      if (hrCount === sectionIndex) hrPos = offset;
    }
  });
  if (hrPos == null) return;
  view.dispatch(view.state.tr.setNodeMarkup(hrPos, null, { daSectionName }));
}

export function insertSectionAfter(view, sectionIndex) {
  if (!view) return;
  const { doc, schema } = view.state;
  let hrCount = 0;
  let pos = doc.content.size;
  doc.forEach((node, offset) => {
    if (node.type === schema.nodes.horizontal_rule) {
      hrCount += 1;
      if (hrCount === sectionIndex + 1) pos = offset;
    }
  });
  view.dispatch(view.state.tr.insert(pos, schema.nodes.horizontal_rule.create()));
}

export function deleteSection(view, sectionIndex) {
  if (!view) return;
  const { groups, names } = splitSections(view);
  if (sectionIndex < 0 || sectionIndex >= groups.length) return;

  groups.splice(sectionIndex, 1);
  names.splice(sectionIndex, 1);

  view.dispatch(rebuildSections(view, groups, names).tr);
  setFirstSectionName(names[0]);
}

export function moveSection(view, fromSectionIndex, toSectionIndex, dropPosition) {
  if (!view) return;
  if (isSamePosition(fromSectionIndex, toSectionIndex, dropPosition)) return;

  const { groups, names } = splitSections(view);
  if (fromSectionIndex >= groups.length || toSectionIndex >= groups.length) return;

  const [moved] = groups.splice(fromSectionIndex, 1);
  const [movedName] = names.splice(fromSectionIndex, 1);
  let insertIdx = dropPosition === 'before' ? toSectionIndex : toSectionIndex + 1;
  if (insertIdx > fromSectionIndex) insertIdx -= 1;
  groups.splice(insertIdx, 0, moved);
  names.splice(insertIdx, 0, movedName);

  const { tr, starts } = rebuildSections(view, groups, names);
  if (moved.length) tr.setSelection(NodeSelection.create(tr.doc, starts[insertIdx]));
  view.dispatch(tr);
  setFirstSectionName(names[0]);
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
