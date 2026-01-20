import { resolvePropSchema } from './schema.js';

/**
 * Activation Helper Utilities
 * Reusable logic for determining when array fields should show activation buttons.
 * Can be used in both navigation and editor components.
 */

/**
 * Check if a field is required in its parent schema.
 * @param {Object} node - Form node
 * @param {FormModel} formModel - Form model
 * @returns {boolean}
 */
export function isFieldRequiredInParent(node, formModel) {
  // If node has no parent, it's the root (always "required" in a sense)
  if (!node.groupPointer && node.groupPointer !== '') {
    return true;
  }

  // Get parent node
  const parent = formModel.getGroup(node.groupPointer);
  if (!parent) {
    return false;
  }

  // Check if this field is in the parent's required array
  const parentRequired = parent.schema?.required || [];
  const isRequired = parentRequired.includes(node.key);

  return isRequired;
}

/**
 * Resolve array items schema, handling $ref if present.
 * @param {Object} node - Form node (must be array type)
 * @param {FormModel} formModel - Form model
 * @returns {Object|null} Resolved items schema or null
 */
export function resolveArrayItemsSchema(node, formModel) {
  // Get items schema from node - always at top level for arrays
  let itemsSchema = node.schema?.items;

  if (!itemsSchema) {
    console.warn('Array node missing items schema', node);
    return null;
  }

  // Resolve $ref if present
  if (itemsSchema?.$ref) {
    // Get the full schema from the form model
    // eslint-disable-next-line no-underscore-dangle
    const fullSchema = formModel._schema;
    if (fullSchema) {
      itemsSchema = resolvePropSchema(fullSchema, 'items', itemsSchema);
    }
  }

  return itemsSchema;
}

/**
 * Check if array items are objects or arrays (not primitives).
 * Arrays of objects and arrays of arrays should show activation buttons.
 * @param {Object} itemsSchema - Resolved items schema
 * @returns {boolean}
 */
export function hasObjectItems(itemsSchema) {
  return itemsSchema?.type === 'object' || itemsSchema?.type === 'array' || !!itemsSchema?.properties;
}

/**
 * Check if an array field is currently empty.
 * @param {Object} node - Form node (must be array type)
 * @param {FormModel} formModel - Form model
 * @returns {boolean}
 */
export function isArrayEmpty(node, formModel) {
  const children = formModel.getChildren(node.pointer);
  return children.length === 0;
}

/**
 * Main function: Check if a node should show an activation button.
 *
 * Activation buttons appear when ALL of these conditions are met:
 * 1. Node is an array type
 * 2. Array items are objects (not primitives)
 * 3. Array is currently empty
 * 4. Field is optional (not in parent's required array)
 *
 * @param {Object} node - Form node
 * @param {FormModel} formModel - Form model
 * @returns {boolean}
 */
export function shouldShowActivationButton(node, formModel) {
  // Condition 1: Must be an array type
  if (node.type !== 'array') {
    return false;
  }

  // Condition 2: Array items must be objects (not primitives)
  const itemsSchema = resolveArrayItemsSchema(node, formModel);
  const isObjectItems = hasObjectItems(itemsSchema);

  if (!isObjectItems) {
    return false;
  }

  // Condition 3: Array must be currently empty
  const isEmpty = isArrayEmpty(node, formModel);

  if (!isEmpty) {
    return false;
  }

  // Condition 4: Field must be optional
  const isRequired = isFieldRequiredInParent(node, formModel);
  const shouldShow = !isRequired;

  return shouldShow;
}

/**
 * Get activation info for a node (useful for rendering activation UI).
 * @param {Object} node - Form node
 * @param {FormModel} formModel - Form model
 * @returns {Object|null} Activation info or null if not applicable
 */
export function getActivationInfo(node, formModel) {
  if (!shouldShowActivationButton(node, formModel)) {
    return null;
  }

  const itemsSchema = resolveArrayItemsSchema(node, formModel);

  return {
    pointer: node.pointer,
    label: node.title,
    itemsSchema,
    canActivate: true,
  };
}
