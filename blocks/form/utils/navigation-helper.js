import {
  EVENT_FOCUS_ELEMENT,
  EVENT_ACTIVE_STATE_CHANGE,
} from '../constants.js';
import { findFirstErrorField } from './validation-helper.js';

export function navigateToPointer(pointer, options = {}) {
  if (pointer == null) return;

  const {
    scroll = true,
    scrollEditor = scroll,
    scrollNavigation = scroll,
  } = options;

  window.dispatchEvent(new CustomEvent(EVENT_ACTIVE_STATE_CHANGE, {
    detail: { pointer },
    bubbles: true,
    composed: true,
  }));

  window.dispatchEvent(new CustomEvent(EVENT_FOCUS_ELEMENT, {
    detail: {
      pointer,
      scrollEditor,
      scrollNavigation,
      targetFieldPointer: options.targetFieldPointer,
    },
    bubbles: true,
    composed: true,
  }));
}

export function navigateToField(fieldPointer, formModel, options = {}) {
  if (!fieldPointer) return;

  const fieldNode = formModel?.getField(fieldPointer);
  let groupPointer = fieldNode?.groupPointer ?? fieldPointer;

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

export function navigateToFirstError(groupPointer, formModel, validationState, options = {}) {
  const fieldPointer = findFirstErrorField(groupPointer, formModel, validationState);
  navigateToField(fieldPointer, formModel, options);
}
