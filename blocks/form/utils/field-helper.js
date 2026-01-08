import { PRIMITIVE_TYPES, SEMANTIC_TYPES } from '../constants.js';

/**
 * Get enum options from schema (handles both direct enum and array items enum).
 * @param {Object} schema - Field schema
 * @returns {Array|null}
 */
export function getEnumOptions(schema) {
  return schema.enum
    || schema.properties?.enum
    || schema.items?.enum
    || schema.properties?.items?.enum
    || null;
}

/**
 * Determine the appropriate field type from schema.
 * @param {Object} schema - Field schema
 * @returns {'checkbox' | 'select' | 'number' | 'textarea' | 'text'}
 */
export function determineFieldType(schema) {
  const type = schema.type || schema.properties?.type;

  // Boolean → checkbox
  if (type === 'boolean') {
    return 'checkbox';
  }

  // Number/Integer → number input
  if (type === 'number' || type === 'integer') {
    return 'number';
  }

  // Long text semantic type → textarea
  const semanticType = schema['x-semantic-type'] || schema.properties?.['x-semantic-type'];
  if (semanticType === SEMANTIC_TYPES.LONG_TEXT) {
    return 'textarea';
  }

  // Has enum options → select
  const hasEnum = getEnumOptions(schema)?.length > 0;
  if (hasEnum) {
    return 'select';
  }

  // Default → text input
  return 'text';
}

/**
 * Check if schema represents a primitive type.
 * @param {Object} schema - Field schema
 * @returns {boolean}
 */
export function isPrimitiveType(schema) {
  const type = schema.properties?.type;
  return PRIMITIVE_TYPES.includes(type);
}
