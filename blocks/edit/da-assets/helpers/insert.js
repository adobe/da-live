import { DOMParser as proseDOMParser, Fragment } from 'da-y-wrapper';

/**
 * Walks up the ProseMirror node tree from the current selection
 * to find the nearest enclosing table (block context).
 */
export function findBlockContext(view) {
  const { $from } = view.state.selection;
  for (let { depth } = $from; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type === view.state.schema.nodes.table) {
      return node;
    }
  }
  return null;
}

/**
 * Returns the block name of the table the cursor is in, or null if not in a block.
 * Format: lowercase, spaces replaced with dashes, parenthetical suffixes stripped.
 */
export function getBlockName(view) {
  const block = findBlockContext(view);
  if (!block || block.type !== view.state.schema.nodes.table) return null;

  const firstCell = block.firstChild?.firstChild;
  if (!firstCell) return null;

  return firstCell.textContent?.toLowerCase().split('(')[0].trim().replaceAll(' ', '-') || null;
}

/**
 * Creates and dispatches a ProseMirror image node at the current selection.
 */
export function insertImage(view, src, alt) {
  const { state } = view;
  const attrs = { src, style: 'width: 180px' };
  if (alt) attrs.alt = alt;
  const node = state.schema.nodes.image.create(attrs);
  view.dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
}

/**
 * Creates and dispatches a ProseMirror link node (wrapped in a paragraph) at the current selection.
 */
export function insertLink(view, src) {
  const { state } = view;
  const para = document.createElement('p');
  const link = document.createElement('a');
  link.href = src;
  link.innerText = src;
  para.append(link);
  const parsed = proseDOMParser.fromSchema(state.schema).parse(para);
  view.dispatch(state.tr.replaceSelectionWith(parsed).scrollIntoView());
}

/**
 * Inserts an array of ProseMirror nodes as a Fragment at the current selection.
 * Used to insert multiple crop images at once.
 */
export function insertFragment(view, nodes) {
  const { state } = view;
  const fragment = Fragment.fromArray(nodes);
  view.dispatch(state.tr.insert(state.selection.from, fragment).deleteSelection().scrollIntoView());
}

/**
 * Creates an image node without dispatching it (used for building fragment arrays).
 */
export function createImageNode(view, src, alt) {
  const attrs = { src, style: 'width: 180px' };
  if (alt) attrs.alt = alt;
  return view.state.schema.nodes.image.create(attrs);
}
