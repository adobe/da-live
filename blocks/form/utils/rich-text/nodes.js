/**
 * Lists the children of a node with their document positions.
 * @param {object} parent The ProseMirror node.
 * @param {number} [start] The position of the start of its content.
 * @returns {{ node: object, position: number }[]} The child nodes and their positions.
 */
export function childrenAt(parent, start = 0) {
  const children = [];
  parent.forEach((node, offset) => children.push({ node, position: start + offset }));
  return children;
}

/**
 * Lists the children of a node.
 * @param {object} parent The ProseMirror node.
 * @returns {object[]} The child nodes.
 */
export const childrenOf = (parent) => childrenAt(parent).map(({ node }) => node);
