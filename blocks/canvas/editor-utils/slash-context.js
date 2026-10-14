function paragraphMode($from) {
  if ($from.parent.type.name !== 'paragraph' || $from.depth < 1) return null;
  const parentType = $from.node($from.depth - 1).type.name;
  if (parentType === 'doc') return 'block';
  if (parentType === 'table_cell') return 'cell';
  return null;
}

export function getSlashContext(state) {
  const { $from } = state.selection;
  const mode = paragraphMode($from);
  if (!mode) return null;

  const paraStart = $from.start();
  const head = state.selection.from;
  if (head <= paraStart) return null;

  const prefix = state.doc.textBetween(paraStart, head, '￼', '￼');
  const slashIndex = prefix.lastIndexOf('/');
  if (slashIndex === -1) return null;

  if (slashIndex > 0) {
    if (mode !== 'cell') return null;
    if (!prefix.slice(0, slashIndex).trimEnd().endsWith(',')) return null;
  }

  const query = prefix.slice(slashIndex + 1);
  if (query.length > 50) return null;

  return { query, anchorPos: paraStart + slashIndex, mode };
}
