import { slotColorSet } from '../../editor-utils/author-color.js';

export function authorKey(author) {
  return author?.email || author?.id || '';
}

export function buildAuthorColorMap(store) {
  const firstSeen = new Map();
  store?.forEach((comment) => {
    const key = authorKey(comment.author);
    if (!key) return;
    const at = comment.createdAt ?? 0;
    if (!firstSeen.has(key) || at < firstSeen.get(key)) firstSeen.set(key, at);
  });
  const ordered = [...firstSeen.entries()]
    .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))
    .map(([key]) => key);
  const map = new Map();
  ordered.forEach((key, i) => map.set(key, slotColorSet(i)));
  return map;
}

export function authorColorSet(store, author, map) {
  const colorMap = map ?? buildAuthorColorMap(store);
  return colorMap.get(authorKey(author)) ?? slotColorSet(colorMap.size);
}
