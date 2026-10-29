import { insertDroppedHtml } from '../../editor-utils/html-drop.js';

export function handleHtmlDrop({ html, anchor, side }, ctx) {
  const { view } = ctx;
  if (!view?.editable || !['before', 'after'].includes(side)) return false;
  if (anchor?.kind === 'main') {
    if (anchor.index !== 0 || side !== 'before') return false;
    return insertDroppedHtml({ view, html, position: 0 });
  }
  if (!['block', 'text', 'image'].includes(anchor?.kind)
    || !Number.isSafeInteger(anchor.index)) return false;
  const position = anchor.index - (anchor.kind === 'image' ? 0 : 1);
  if (position < 0 || position >= view.state.doc.content.size) return false;
  const node = view.state.doc.nodeAt(position);
  if (!node || (anchor.kind === 'block' && node.type.name !== 'table')
    || (anchor.kind === 'image' && node.type.name !== 'image')) return false;
  let boundary;
  view.state.doc.forEach((child, offset) => {
    if (position >= offset && position < offset + child.nodeSize) {
      boundary = side === 'before' ? offset : offset + child.nodeSize;
    }
  });
  return insertDroppedHtml({ view, html, position: boundary });
}
