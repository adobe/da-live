/**
 * Utility functions for JSON pointer manipulation.
 * Provides reusable logic for parsing and manipulating RFC 6901 JSON pointers.
 */

/**
 * Parse an array item pointer to extract the array pointer and item index.
 * @param {string} pointer - Array item pointer (e.g., '/items/2')
 * @returns {Object} Object with arrayPointer and index
 * @example
 * parseArrayItemPointer('/items/2')
 * // Returns: { arrayPointer: '/items', index: 2 }
 */
export function parseArrayItemPointer(pointer) {
  if (!pointer || typeof pointer !== 'string') {
    return { arrayPointer: null, index: null };
  }

  const parts = pointer.split('/');
  const lastPart = parts.pop();
  const index = parseInt(lastPart, 10);

  if (!Number.isInteger(index) || index < 0) {
    return { arrayPointer: null, index: null };
  }

  return {
    arrayPointer: parts.join('/'),
    index,
  };
}

/**
 * Build a new array item pointer from array pointer and index.
 * @param {string} arrayPointer - Array pointer (e.g., '/items')
 * @param {number} index - Item index
 * @returns {string} Array item pointer (e.g., '/items/2')
 * @example
 * buildArrayItemPointer('/items', 2)
 * // Returns: '/items/2'
 */
export function buildArrayItemPointer(arrayPointer, index) {
  if (!arrayPointer || typeof arrayPointer !== 'string') {
    return null;
  }
  if (!Number.isInteger(index) || index < 0) {
    return null;
  }
  return `${arrayPointer}/${index}`;
}

/**
 * Get the parent pointer from a child pointer.
 * @param {string} pointer - Child pointer (e.g., '/group/field')
 * @returns {string|null} Parent pointer (e.g., '/group') or null if root
 * @example
 * getParentPointer('/group/field')
 * // Returns: '/group'
 *
 * getParentPointer('/field')
 * // Returns: ''
 */
export function getParentPointer(pointer) {
  if (!pointer || pointer === '') return null;
  const lastSlash = pointer.lastIndexOf('/');
  if (lastSlash === -1) return null;
  return pointer.substring(0, lastSlash);
}

/**
 * Check if a pointer value is defined (not undefined or null).
 * Empty string '' is a valid pointer (represents root), so this returns true for it.
 *
 * @param {string|undefined|null} pointer - Pointer to check
 * @returns {boolean} True if pointer is defined (including empty string)
 * @example
 * isPointerDefined('') // true - empty string is valid (root pointer)
 * isPointerDefined('/field') // true
 * isPointerDefined(null) // false
 * isPointerDefined(undefined) // false
 */
export function isPointerDefined(pointer) {
  return pointer !== undefined && pointer !== null;
}
