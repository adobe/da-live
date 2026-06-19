import { DOMParser as PMDOMParser } from 'da-y-wrapper';

function getTableBlockName(tableNode) {
  const firstRow = tableNode.firstChild;
  if (!firstRow) return '';
  const firstCell = firstRow.firstChild;
  if (!firstCell) return '';
  const raw = firstCell.textContent?.trim() ?? '';
  const match = raw.match(/^([a-zA-Z0-9_\s-]+)(?:\s*\([^)]*\))?$/);
  return match ? match[1].trim().toLowerCase() : raw.toLowerCase();
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
      if (blockName === 'metadata') return;
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

  const fromBlockSize = fromBlockNode.nodeSize;
  const toBlockSize = toBlockNode.nodeSize;

  const insertPos = dropPosition === 'before'
    ? toBlockPos
    : toBlockPos + toBlockSize;
  const adjustedInsertPos = insertPos > fromBlockPos
    ? insertPos - fromBlockSize
    : insertPos;

  view.dispatch(
    view.state.tr
      .delete(fromBlockPos, fromBlockPos + fromBlockSize)
      .insert(adjustedInsertPos, fromBlockNode),
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
  reordered.forEach((sectionNodes, i) => {
    if (i > 0) newNodes.push(hrNode);
    newNodes.push(...sectionNodes);
  });

  view.dispatch(view.state.tr.replaceWith(0, doc.content.size, newNodes));
}
