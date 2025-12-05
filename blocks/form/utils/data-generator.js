// Minimal data generator for JSON Schema with conservative defaults.
// Policy:
// - Prefer const/default when present
// - Otherwise minimal empties: string '', number/integer null, boolean false, null null
// - Objects: include all properties (both required and optional)
// - Arrays: if optional -> [], if required -> single item (recursively generated)

import { derefRef, resolvePropSchema, normalizeRoot } from './schema.js';

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
  if (node.type === 'string' || typeof first === 'string') return '';
  return null;
}

function generatePrimitive(node) {
  if (node.const !== undefined) return deepClone(node.const);
  if (node.default !== undefined) return deepClone(node.default);
  if (node.enum) return pickEnumMinimal(node);
  const { type } = node;
  if (type === 'string') return '';
  if (type === 'number' || type === 'integer') return null;
  if (type === 'boolean') return false; // Default to false for checkboxes unless schema specifies otherwise
  if (type === 'null') return null;
  return null;
}

function generateForNode(node, fullSchema, requiredSet) {
  if (!node || typeof node !== 'object') return null;

  // Resolve $ref first if present at this level
  if (node.$ref) {
    const target = derefRef(node.$ref, fullSchema);
    if (target) return generateForNode(target, fullSchema, requiredSet);
  }

  // If node explicitly carries a type, dispatch accordingly
  if (node.type === 'array' || node.items) {
    const isRequiredHere = requiredSet?.has?.(node.propName);
    const itemsSchema = node.items?.oneOf ? node.items.oneOf[0] : node.items;
    if (!isRequiredHere) return [];
    return [generateForNode(itemsSchema, fullSchema, new Set())];
  }

  if (node.type === 'object' || node.properties) {
    const props = node.properties || {};
    const required = new Set(node.required || []);
    const out = {};
    for (const [k, v] of Object.entries(props)) {
      const child = resolvePropSchema(k, v, fullSchema);
      const childWithName = tagWithPropName(child, k);
      // Always include the property. For arrays, generateForNode
      // will return [] when the property is optional.
      const value = generateForNode(childWithName, fullSchema, required);
      out[k] = value;
    }
    return out;
  }

  // Fallback to primitive generation (covers enums/default/const)
  return generatePrimitive(node);
}

export default function generateMinimalDataForSchema(schema) {
  const root = normalizeRoot(schema);
  return generateForNode(root, schema, new Set());
}


