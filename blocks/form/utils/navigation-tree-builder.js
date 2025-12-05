import { getGroupErrorCount } from './validation-helper.js';
import { isPrimitiveType } from './field-helper.js';

/**
 * Check if a node should be rendered in navigation.
 * @param {Object} node - Form node
 * @param {FormModel} formModel - Form model
 * @returns {boolean}
 */
export function shouldRenderInNav(node, formModel) {
  // Don't render if it has items type (array of primitives)
  if (node.schema?.properties?.items?.type) {
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
 * @returns {Object} - Tree node { id, label, badge?, children? }
 */
function buildTreeNode(node, formModel, validationState) {
  const errorCount = getGroupErrorCount(node.pointer, validationState);
  const children = formModel.getChildren(node.pointer);
  
  const treeNode = {
    id: node.pointer,
    label: node.schema.title,
  };
  
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
  
  return children
    .filter((child) => shouldRenderInNav(child, formModel))
    .map((child) => buildTreeNode(child, formModel, validationState));
}

