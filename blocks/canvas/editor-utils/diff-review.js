const MARKERS = new Set(['diff_added', 'diff_deleted']);

export function hasGroupedMarkup(doc) {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (MARKERS.has(node.type.name) && node.attrs.diffGroup) found = true;
    return !found;
  });
  return found;
}
