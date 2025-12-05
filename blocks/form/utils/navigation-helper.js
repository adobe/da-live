import { EVENT_FOCUS_ELEMENT } from '../constants.js';
import { findFirstErrorField } from './validation-helper.js';

/**
 * Navigate to a pointer (group or field).
 * @param {string} pointer - Target pointer
 * @param {Object} options - Navigation options
 * @param {string} options.source - Event source ('editor', 'sidebar', 'breadcrumb')
 * @param {string} options.targetFieldPointer - Specific field to focus within group
 * @param {string} options.reason - Reason for navigation
 */
export function navigateToPointer(pointer, options = {}) {
  if (pointer == null) return;

  window.dispatchEvent(new CustomEvent(EVENT_FOCUS_ELEMENT, {
    detail: {
      pointer,
      source: options.source || 'unknown',
      targetFieldPointer: options.targetFieldPointer,
      reason: options.reason,
    },
    bubbles: true,
    composed: true,
  }));
}

/**
 * Navigate to the first error field within a group.
 * @param {string} groupPointer - Group pointer
 * @param {FormModel} formModel - Form model
 * @param {ValidationState} validationState - Current validation state
 * @param {Object} options - Navigation options
 */
export function navigateToFirstError(groupPointer, formModel, validationState, options = {}) {
  const fieldPointer = findFirstErrorField(groupPointer, formModel, validationState);

  navigateToPointer(groupPointer, {
    ...options,
    targetFieldPointer: fieldPointer,
    reason: options.reason || 'validation-error',
  });
}

/**
 * Navigate to a specific field (finds its group and focuses field).
 * @param {string} fieldPointer - Field pointer
 * @param {FormModel} formModel - Form model
 * @param {Object} options - Navigation options
 */
export function navigateToField(fieldPointer, formModel, options = {}) {
  if (!fieldPointer) return;

  const fieldNode = formModel?.getField(fieldPointer);
  const groupPointer = fieldNode?.groupPointer ?? fieldPointer;

  navigateToPointer(groupPointer, {
    ...options,
    targetFieldPointer: fieldPointer,
  });
}
