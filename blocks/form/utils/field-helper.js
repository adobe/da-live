import { PRIMITIVE_TYPES, SEMANTIC_TYPES } from '../constants.js';

/**
 * Get enum options from schema (handles both direct enum and array items enum).
 * @param {Object} schema - Field schema
 * @returns {Array|null}
 */
export function getEnumOptions(schema) {
  // Direct enum on this schema
  if (schema.enum) {
    return schema.enum;
  }
  
  // For array schemas, check if items have enum
  if (schema.items?.enum) {
    return schema.items.enum;
  }
  
  return null;
}

/**
 * Determine the appropriate field type from schema.
 * @param {Object} schema - Field schema
 * @returns {'checkbox' | 'select' | 'number' | 'textarea' | 'text'}
 */
export function determineFieldType(schema) {
  const type = schema.type;

  if (!type) {
    console.warn('Schema missing type', schema);
    return 'text';
  }

  // Boolean → checkbox
  if (type === 'boolean') {
    return 'checkbox';
  }

  // Number/Integer → number input
  if (type === 'number' || type === 'integer') {
    return 'number';
  }

  // Long text semantic type → textarea
  const semanticType = schema['x-semantic-type'];
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
  const type = schema.type;
  return PRIMITIVE_TYPES.includes(type);
}
