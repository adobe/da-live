/**
 * Decode a pointer token (RFC 6901 encoding).
 * @param {string} token - Encoded token
 * @returns {string} - Decoded token
 */
export function decodePointerToken(token) {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Build breadcrumb segments from root to pointer.
 * @param {Object} root - Root node
 * @param {string} pointer - Current pointer
 * @param {FormModel} formModel - Form model
 * @returns {Array<{id: string, label: string}>}
 */
export function buildBreadcrumbSegments(root, pointer, formModel) {
  const segments = [];

  // Always add root
  if (!root) return segments;
  segments.push({
    id: root.pointer,
    label: root.schema?.title || 'Root',
  });

  if (!pointer || !formModel) return segments;

  // Build path by following pointer tokens
  const tokens = pointer.split('/').slice(1).map(decodePointerToken);
  let currentPointer = '';

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    currentPointer = currentPointer === '' ? `/${token}` : `${currentPointer}/${token}`;
    const node = formModel.getNode(currentPointer);

    if (!node) break;

    // For array indices, show "Item #N"
    if (/^\d+$/.test(token)) {
      const parentPointer = currentPointer.slice(0, -token.length - 1) || '';
      const parentNode = formModel.getNode(parentPointer);
      const base = parentNode?.schema?.title || 'Item';
      segments.push({
        id: node.pointer,
        label: `${base} #${Number(token) + 1}`,
      });
    } else {
      segments.push({
        id: node.pointer,
        label: node.schema?.title || token,
      });
    }
  }

  return segments;
}
