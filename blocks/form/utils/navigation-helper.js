import {
  EVENT_FOCUS_ELEMENT,
  EVENT_ACTIVE_STATE_CHANGE,
  EVENT_SOURCE,
} from '../constants.js';
import { findFirstErrorField } from './validation-helper.js';

/** Navigates to a group or field in the form. */
export function navigateToPointer(pointer, options = {}) {
  if (pointer == null) return;

  // Dispatch active state change
  window.dispatchEvent(new CustomEvent(EVENT_ACTIVE_STATE_CHANGE, {
    detail: { pointer },
    bubbles: true,
    composed: true,
  }));

  // Also dispatch for scroll coordination
  window.dispatchEvent(new CustomEvent(EVENT_FOCUS_ELEMENT, {
    detail: {
      pointer,
      source: options.source || EVENT_SOURCE.UNKNOWN,
      targetFieldPointer: options.targetFieldPointer,
      reason: options.reason,
    },
    bubbles: true,
    composed: true,
  }));
}

/** Navigates to the parent group of a field. */
export function navigateToField(fieldPointer, formModel, options = {}) {
  if (!fieldPointer) return;

  const fieldNode = formModel?.getField(fieldPointer);
  let groupPointer = fieldNode?.groupPointer ?? fieldPointer;

  // Primitive arrays aren't rendered in navigation, use their parent instead
  if (groupPointer != null) {
    const groupNode = formModel?.getNode(groupPointer);
    if (groupNode?.isPrimitiveArray) {
      groupPointer = groupNode.groupPointer ?? groupPointer;
    }
  }

  navigateToPointer(groupPointer, {
    ...options,
    targetFieldPointer: fieldPointer,
  });
}

/** Navigates to the first validation error within a group. */
export function navigateToFirstError(groupPointer, formModel, validationState, options = {}) {
  const fieldPointer = findFirstErrorField(groupPointer, formModel, validationState);

  navigateToField(fieldPointer, formModel, {
    ...options,
    reason: options.reason || 'validation-error',
  });
}
