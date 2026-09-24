import { DOMParser as PMDOMParser, TextSelection } from 'da-y-wrapper';

export function getTableDropPosition(doc, anchor, side) {
  if (!anchor || !['block', 'text', 'image'].includes(anchor.kind)
    || !Number.isSafeInteger(anchor.index)
    || !['before', 'after'].includes(side)) return null;

  const position = anchor.index - (anchor.kind === 'image' ? 0 : 1);
  if (position < 0 || position >= doc.content.size) return null;
  const node = doc.nodeAt(position);
  if (!node || (anchor.kind === 'block' && node.type.name !== 'table')
    || (anchor.kind === 'image' && node.type.name !== 'image')
    || (anchor.kind === 'text' && node.type.name === 'table')) return null;

  let outer = null;
  doc.forEach((child, offset) => {
    if (position >= offset && position < offset + child.nodeSize) {
      outer = { node: child, offset };
    }
  });
  if (!outer) return null;
  return side === 'before' ? outer.offset : outer.offset + outer.node.nodeSize;
}

export function insertDroppedTable({ html, anchor, side }, ctx) {
  const { view } = ctx;
  if (!view || typeof html !== 'string') return false;
  const position = getTableDropPosition(view.state.doc, anchor, side);
  if (position === null) return false;

  const dom = new DOMParser().parseFromString(html, 'text/html');
  if (!dom.body.querySelector('table')) return false;
  const parsed = PMDOMParser.fromSchema(view.state.schema).parse(dom.body);
  if (![...parsed.content.content].some((node) => node.type.name === 'table')) return false;

  const tr = view.state.tr.insert(position, parsed.content);
  const end = position + parsed.content.size;
  tr.setSelection(TextSelection.near(tr.doc.resolve(end), 1)).scrollIntoView();
  view.dispatch(tr);
  return true;
}
