/**
 * Checks whether a node is a field of an SDK shared schema, such as an image. Such a
 * value is one field even though it is an object.
 * @param {object} [node] A node of the engine's model.
 * @returns {boolean} Whether the node references a shared schema.
 */
export function isSharedSchemaField(node) {
  return node?.sharedSchemaName !== undefined;
}

/**
 * Checks whether a node renders as a group of fields rather than as one field.
 * @param {object} [node] A node of the engine's model.
 * @returns {boolean} Whether the node renders as a group of fields.
 */
export function isStructured(node) {
  return !isSharedSchemaField(node) && (node?.kind === 'object' || node?.kind === 'array');
}
