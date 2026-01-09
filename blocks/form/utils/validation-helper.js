/**
 * Get validation error message for a field.
 * @param {string} pointer - Field pointer
 * @param {ValidationState} validationState - Current validation state
 * @returns {string} - Error message or empty string
 */
export function getFieldError(pointer, validationState) {
  if (!validationState) return '';
  const errors = validationState.fieldErrors?.get(pointer);
  return errors?.[0] || '';
}

/**
 * Get error count for a group (includes all descendant errors).
 * @param {string} pointer - Group pointer
 * @param {ValidationState} validationState - Current validation state
 * @returns {number} - Error count
 */
export function getGroupErrorCount(pointer, validationState) {
  const key = pointer ?? '';
  const value = validationState?.groupCounts?.get(key);
  return Number(value) || 0;
}

/**
 * Find the first field with an error within a group.
 * @param {string} groupPointer - Group pointer
 * @param {FormModel} formModel - Form model
 * @param {ValidationState} validationState - Current validation state
 * @returns {string|null} - First error field pointer or null
 */
export function findFirstErrorField(groupPointer, formModel, validationState) {
  const children = formModel?.getChildren(groupPointer) || [];
  const fieldErrors = validationState?.fieldErrors;

  for (const child of children) {
    if (formModel?.isField(child.pointer)) {
      const errors = fieldErrors?.get(child.pointer);
      if (errors?.length > 0) {
        return child.pointer;
      }
    }
  }
  return null;
}

/**
 * Check if a field is required in the model.
 * @param {string} pointer - Field pointer
 * @param {FormModel} formModel - Form model
 * @returns {boolean}
 */
export function isFieldRequired(pointer, formModel) {
  const fieldNode = formModel?.getField(pointer);
  return Boolean(fieldNode?.required);
}
