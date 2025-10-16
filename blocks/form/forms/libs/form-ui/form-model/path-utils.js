/**
 * Convert a JSON Pointer (e.g., "/recipes/0/title") to a dotted/bracket path
 * used by inputs and navigation (e.g., "recipes[0].title").
 * Root pointer "" maps to an empty string.
 */
export function pointerToInputName(pointer) {
  if (!pointer) return '';
  const tokens = String(pointer).split('/').slice(1).map((t) => t.replace(/~1/g, '/').replace(/~0/g, '~'));
  let out = '';
  tokens.forEach((tok) => {
    const isIndex = /^\d+$/.test(tok);
    if (isIndex) {
      out += `[${Number(tok)}]`;
    } else {
      out += out ? `.${tok}` : tok;
    }
  });
  return out;
}

/**
 * Convert a dotted/bracket path (e.g., "recipes[0].title") to a JSON Pointer
 * (e.g., "/recipes/0/title"). Empty path maps to "".
 */
export function inputNameToPointer(name) {
  const path = String(name || '');
  if (!path) return '';
  const tokens = [];
  const regex = /[^.\[\]]+|\[(\d+)\]/g;
  let match;
  while ((match = regex.exec(path)) !== null) {
    if (match[1] !== undefined) tokens.push(String(Number(match[1])));
    else tokens.push(match[0]);
  }
  const enc = (s) => s.replace(/~/g, '~0').replace(/\//g, '~1');
  return '/' + tokens.map(enc).join('/');
}

/**
 * Find a Form UI Model node by JSON Pointer.
 * @param {object} root - FormUiModel root
 * @param {string} pointer - JSON Pointer (e.g., "/a/0/b")
 * @returns {object|null}
 */
export function findModelNodeByPointer(root, pointer) {
  if (!root || !pointer) return null;
  if (root.dataPath === pointer) return root;
  if (root.type === 'array' && Array.isArray(root.items)) {
    for (const child of root.items) {
      const found = findModelNodeByPointer(child, pointer);
      if (found) return found;
    }
  }
  if (root.children) {
    for (const child of Object.values(root.children)) {
      const found = findModelNodeByPointer(child, pointer);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Return true if a dotted path belongs to an active node in the Form UI Model.
 * @param {object} modelRoot
 * @param {string} dottedPath
 */
export function isActiveModelDottedPath(modelRoot, dottedPath) {
  const ptr = inputNameToPointer(dottedPath);
  const node = findModelNodeByPointer(modelRoot, ptr);
  return !!(node && node.isActive);
}


