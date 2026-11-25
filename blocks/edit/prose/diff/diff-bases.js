const MARKERS = new Set(['diff_added', 'diff_deleted']);

export function markerGroups(doc, from = 0, to = doc.content.size) {
  const groups = new Set();
  doc.nodesBetween(from, to, (node) => {
    if (!MARKERS.has(node.type.name)) return true;
    if (node.attrs.diffGroup) groups.add(node.attrs.diffGroup);
    return false;
  });
  return [...groups];
}

export function removeResolvedBases(tr, groups) {
  const wanted = new Set(groups.filter(Boolean));
  if (!wanted.size) return tr;
  const open = new Set(markerGroups(tr.doc));
  const orphans = [];
  tr.doc.descendants((node, pos) => {
    if (MARKERS.has(node.type.name)) return false;
    if (node.type.name !== 'diff_base') return true;
    const group = node.attrs.diffGroup;
    if (wanted.has(group) && !open.has(group)) orphans.push({ node, pos });
    return false;
  });
  orphans.reverse().forEach(({ node, pos }) => tr.delete(pos, pos + node.nodeSize));
  return tr;
}
