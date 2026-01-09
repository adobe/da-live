import { getGroupErrorCount } from './validation-helper.js';
import { isPrimitiveType } from './field-helper.js';

/**
 * Check if a node should be rendered in navigation.
 * @param {Object} node - Form node
 * @param {FormModel} formModel - Form model
 * @returns {boolean}
 */
export function shouldRenderInNav(node, formModel) {
  // Don't render primitive arrays (they're single fields, not groups)
  if (node.isPrimitiveArray) {
    return false;
  }

  // Don't render primitive types
  if (isPrimitiveType(node.schema)) {
    return false;
  }

  // Only render if it has children
  const children = formModel?.getChildren(node.pointer) || [];
  return children.length > 0;
}

/**
 * Build a navigation tree node with error badges.
 * @param {Object} node - Form node
 * @param {FormModel} formModel - Form model
 * @param {ValidationState} validationState - Current validation state
 * @returns {Object} - Tree node { id, label, badge?, children?, nodeType? }
 */
function buildTreeNode(node, formModel, validationState) {
  const errorCount = getGroupErrorCount(node.pointer, validationState);
  const children = formModel.getChildren(node.pointer);

  let label = node.schema.title;
  let isArrayItem = false;
  let arrayIndex = null;
  let parentPointer = null;

  if (node.groupPointer) {
    const parentNode = formModel.getNode(node.groupPointer);
    if (parentNode?.type === 'array') {
      isArrayItem = true;
      parentPointer = node.groupPointer;
      arrayIndex = parseInt(node.pointer.split('/').pop(), 10);
      label = `#${arrayIndex + 1} ${node.schema.title}`;
    }
  }

  const treeNode = {
    id: node.pointer,
    label,
    itemType: node.type || 'object',
  };

  if (isArrayItem) {
    treeNode.isArrayItem = true;
    treeNode.arrayIndex = arrayIndex + 1;
    treeNode.parentPointer = parentPointer;
  }

  // Add badge if there are errors
  if (errorCount > 0) {
    treeNode.badge = errorCount;
  }

  // Recursively build children
  if (children.length > 0) {
    const childNodes = children
      .filter((child) => shouldRenderInNav(child, formModel))
      .map((child) => buildTreeNode(child, formModel, validationState));

    if (childNodes.length > 0) {
      treeNode.children = childNodes;
    }
  }

  return treeNode;
}

/**
 * Build a navigation tree from form model and validation state.
 * @param {FormModel} formModel - Form model
 * @param {ValidationState} validationState - Current validation state
 * @param {string} rootPointer - Root pointer (default: '')
 * @returns {Array<Object>} - Tree structure
 */
export function buildNavigationTree(formModel, validationState, rootPointer = '') {
  if (!formModel) return [];

  const root = rootPointer ? formModel.getGroup(rootPointer) : formModel.root;
  if (!root) return [];

  const children = formModel.getChildren(root.pointer);

  const filteredChildren = children.filter((child) => shouldRenderInNav(child, formModel));

  const treeNodes = filteredChildren.map((child) => (
    buildTreeNode(child, formModel, validationState)
  ));

  return treeNodes;
}
