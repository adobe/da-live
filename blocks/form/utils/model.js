/**
 * Checks whether a node renders as a group of fields rather than as one field. A value of
 * a `$ref` type, such as an asset, is one field even though it is an object.
 * @param {object} [node] A node of the engine's model.
 * @returns {boolean} Whether the node renders as a group of fields.
 */
export function isStructured(node) {
  return node?.typeRef === undefined && (node?.kind === 'object' || node?.kind === 'array');
}
