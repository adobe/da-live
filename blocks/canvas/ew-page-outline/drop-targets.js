export function contentChildLabel(child) {
  switch (child.kind) {
    case 'heading': return `Heading ${child.level}`;
    case 'list': return child.ordered ? 'Numbered list' : 'Bullet list';
    case 'image': return 'Image';
    case 'code': return 'Code block';
    case 'quote': return 'Blockquote';
    default: return 'Paragraph';
  }
}

export function sectionLabel(sec) {
  return sec.name || `Section ${sec.sectionIndex + 1}`;
}

export function blockLabel(item) {
  return `${item.name}${item.variant ? ` (${item.variant})` : ''}`;
}

function rowsOf(sec, expanded) {
  return sec.items.flatMap((item) => {
    if (item.type === 'block') return [{ kind: 'block', item }];
    if (expanded.has(item.proseIndex)) return item.children.map((child) => ({ kind: 'content', child }));
    return [{ kind: 'group', item }];
  });
}

function isDragged(row, dragging) {
  if (dragging.type === 'block') return row.kind === 'block' && row.item.blockIndex === dragging.index;
  return row.kind === 'content' && row.child.proseIndex === dragging.index.proseIndex;
}

function rowTarget(row, dropPosition) {
  if (row.kind === 'block') return { blockIndex: row.item.blockIndex, dropPosition };
  if (row.kind === 'content') return { contentChild: row.child, dropPosition };
  const { children } = row.item;
  const contentChild = dropPosition === 'before' ? children[0] : children[children.length - 1];
  return { contentChild, dropPosition };
}

function rowLabel(row) {
  if (row.kind === 'block') return `${blockLabel(row.item)} block`;
  if (row.kind === 'content') return contentChildLabel(row.child);
  return 'Default content';
}

function sectionTargets(index, sections) {
  const targets = [];
  let origin = 0;
  for (let gap = 0; gap <= sections.length; gap += 1) {
    if (gap === index) origin = targets.length;
    if (gap !== index && gap !== index + 1) {
      const last = gap === sections.length;
      const sec = sections[last ? gap - 1 : gap];
      const dropPosition = last ? 'after' : 'before';
      targets.push({
        target: { sectionIndex: sec.sectionIndex, dropPosition },
        description: `${last ? 'After' : 'Before'} ${sectionLabel(sec)}`,
      });
    }
  }
  return { targets, origin };
}

export function getDropTargets(dragging, sections = [], expanded = new Set()) {
  if (dragging.type === 'section') return sectionTargets(dragging.index, sections);

  const targets = [];
  let origin = 0;
  sections.forEach((sec) => {
    const where = ` in ${sectionLabel(sec)}`;
    const rows = rowsOf(sec, expanded);
    if (!rows.length) {
      targets.push({
        target: { sectionIndex: sec.sectionIndex, dropPosition: 'after' },
        description: `Start of ${sectionLabel(sec)}`,
      });
      return;
    }
    rows.forEach((row, i) => {
      if (isDragged(row, dragging)) {
        origin = targets.length;
        return;
      }
      if (i > 0 && isDragged(rows[i - 1], dragging)) return;
      targets.push({ target: rowTarget(row, 'before'), description: `Before ${rowLabel(row)}${where}` });
    });
    const last = rows[rows.length - 1];
    if (!isDragged(last, dragging)) {
      targets.push({ target: rowTarget(last, 'after'), description: `After ${rowLabel(last)}${where}` });
    }
  });
  return { targets, origin };
}
