// Minimal data generator for JSON Schema with conservative defaults.
// Policy:
// - Prefer const/default when present
// - Otherwise minimal empties: string '', number/integer null, boolean false, null null
// - Objects: include all properties (both required and optional)
// - Arrays: if optional -> [], if required -> single item (recursively generated)
// - Maximum depth: 10 levels to prevent infinite recursion

import { derefRef, resolvePropSchema, normalizeRoot } from './schema.js';
import { MAX_GENERATION_DEPTH, SCHEMA_TYPES } from '../constants.js';

function deepClone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function tagWithPropName(node, name) {
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    return { ...node, propName: name };
  }
  return node;
}

function pickEnumMinimal(node) {
  if (!Array.isArray(node.enum) || node.enum.length === 0) return null;
  if (node.default !== undefined) return deepClone(node.default);
  const first = node.enum[0];
  // For string enums prefer empty string to avoid unwanted values
  if (node.type === SCHEMA_TYPES.STRING || typeof first === 'string') return '';
  return null;
}

function generatePrimitive(node) {
  if (node.const !== undefined) return deepClone(node.const);
  if (node.default !== undefined) return deepClone(node.default);
  if (node.enum) return pickEnumMinimal(node);
  const { type } = node;
  if (type === SCHEMA_TYPES.STRING) return '';
  if (type === SCHEMA_TYPES.NUMBER || type === SCHEMA_TYPES.INTEGER) return null;
  // Default to false for checkboxes unless schema specifies otherwise
  if (type === SCHEMA_TYPES.BOOLEAN) return false;
  if (type === SCHEMA_TYPES.NULL) return null;
  return null;
}

function generateForNode(node, fullSchema, requiredSet, depth = 0) {
  if (!node || typeof node !== 'object') return null;

  // Check depth limit to prevent infinite recursion (circular refs or deep nesting)
  if (depth > MAX_GENERATION_DEPTH) {
    // eslint-disable-next-line no-console
    console.warn(
      `Maximum generation depth (${MAX_GENERATION_DEPTH}) exceeded. Returning empty value.`,
      { nodeType: node.type, propName: node.propName },
    );
    // Return appropriate empty value based on type
    if (node.type === SCHEMA_TYPES.OBJECT || node.properties) return {};
    if (node.type === SCHEMA_TYPES.ARRAY || node.items) return [];
    return null;
  }

  // Resolve $ref first if present at this level
  if (node.$ref) {
    const target = derefRef(fullSchema, node.$ref);
    if (target) return generateForNode(target, fullSchema, requiredSet, depth + 1);
  }

  // If node explicitly carries a type, dispatch accordingly
  if (node.type === SCHEMA_TYPES.ARRAY || node.items) {
    const itemsSchema = node.items?.oneOf ? node.items.oneOf[0] : node.items;

    // Resolve item schema to check its type
    const resolvedItemSchema = itemsSchema?.$ref
      ? derefRef(fullSchema, itemsSchema.$ref)
      : itemsSchema;
    const itemType = resolvedItemSchema?.type;

    // Check if this array is in the requiredSet or has minItems > 0
    const isRequired = requiredSet?.has?.(node.propName);
    const hasExplicitMinItems = node.minItems !== undefined;

    // Auto-populate arrays with complex items (objects/arrays) with at least 1 item
    // to avoid nested activation buttons
    const isComplexItem = itemType === SCHEMA_TYPES.OBJECT || itemType === SCHEMA_TYPES.ARRAY;
    const defaultMinItems = (isRequired || isComplexItem) ? 1 : 0;
    const minItems = hasExplicitMinItems ? node.minItems : defaultMinItems;

    const items = [];
    for (let i = 0; i < minItems; i += 1) {
      items.push(generateForNode(itemsSchema, fullSchema, new Set(), depth + 1));
    }
    return items;
  }

  if (node.type === SCHEMA_TYPES.OBJECT || node.properties) {
    const props = node.properties || {};
    const required = new Set(node.required || []);
    const out = {};
    for (const [k, v] of Object.entries(props)) {
      const child = resolvePropSchema(fullSchema, k, v);
      const childWithName = tagWithPropName(child, k);
      // Always include the property. For arrays, generateForNode
      // will return [] when the property is optional.
      const value = generateForNode(childWithName, fullSchema, required, depth + 1);
      out[k] = value;
    }
    return out;
  }

  // Fallback to primitive generation (covers enums/default/const)
  return generatePrimitive(node);
}

export default function generateMinimalDataForSchema(schema) {
  const root = normalizeRoot(schema);
  return generateForNode(root, schema, new Set(), 0);
}

/**
 * Generate default value for a single array item based on schema.
 * Used when activating optional array fields.
 * @param {Object} arraySchema - The array field schema (node.schema)
 * @param {Object} fullSchema - The full schema for resolving $refs
 * @returns {*} Generated item value
 */
export function generateArrayItem(arraySchema, fullSchema) {
  // For array schemas, items is always at the top level
  const itemsSchema = arraySchema.items;

  if (!itemsSchema) {
    console.warn('Array schema missing items definition', arraySchema);
    return null;
  }

  // Resolve the property schema (handles $refs)
  const resolved = resolvePropSchema(fullSchema, 'item', itemsSchema);

  // Generate the item value (empty required set since array items don't inherit required)
  const generatedValue = generateForNode(resolved, fullSchema, new Set(), 0);

  return generatedValue;
}
