/* eslint-disable no-console */
import { append, get as getPointerValue } from '../utils/rfc6901-pointer.js';

const REQUIRED_PROPERTY_RE = /"([^"]+)"/;

/** Convert Map to plain object for event details. */
function mapToObject(map) {
  const out = {};
  map.forEach((value, key) => {
    out[key ?? ''] = value;
  });
  return out;
}

/**
 * Normalizes validation error pointers to RFC 6901 format.
 * The validator returns pointers in JSON Reference format (with '#' prefix) and sometimes
 * needs adjustment (e.g., for 'required' errors, the pointer points to the parent object
 * rather than the missing field). This function converts them to RFC 6901 pointers that
 * match our field registry structure.
 */
function normalizePointer(error) {
  let pointer = error.instanceLocation ?? error.pointer ?? '';

  if (pointer.startsWith('#')) {
    pointer = pointer.slice(1);
  }

  // For 'required' keyword errors, the pointer points to the parent object,
  // so we need to append the missing property name to get the actual field pointer
  if (error.keyword === 'required') {
    const missing = REQUIRED_PROPERTY_RE.exec(error.error || '');
    if (missing && missing[1]) {
      pointer = append(pointer, missing[1]);
    }
  }

  return pointer;
}

/** Check if a value is considered empty for required field validation. */
function isEmptyValue(value) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Immutable validation state model.
 * Stores field errors, group error counts, and provides methods to query validation status.
 * Created from JSON Schema validation results and form model structure.
 */
class ValidationState {
  constructor({
    fieldErrors,
    groupErrors,
    groupCounts,
    totalErrors,
    firstFieldPointer,
    firstGroupPointer,
    rawErrors,
  }) {
    this.fieldErrors = fieldErrors;
    this.groupErrors = groupErrors;
    this.groupCounts = groupCounts;
    this.totalErrors = totalErrors;
    this.firstFieldPointer = firstFieldPointer;
    this.firstGroupPointer = firstGroupPointer;
    this.rawErrors = rawErrors;
  }

  static empty() {
    const emptyMap = new Map();
    return new ValidationState({
      fieldErrors: emptyMap,
      groupErrors: emptyMap,
      groupCounts: emptyMap,
      totalErrors: 0,
      firstFieldPointer: null,
      firstGroupPointer: null,
      rawErrors: [],
    });
  }

  static fromResult(result, formModel, document) {
    if (!result) return ValidationState.empty();

    const rawErrors = Array.isArray(result.errors) ? result.errors : [];
    if (rawErrors.length === 0) return ValidationState.empty();

    // Filter to keep only errors that map to actual fields
    const filteredErrors = rawErrors.filter((error) => {
      const pointer = normalizePointer(error);
      // Only keep errors that map to a field
      return formModel?.isField(pointer) ?? false;
    });

    const fieldErrors = new Map();
    const groupCounts = new Map();

    const incrementGroupCount = (pointer, amount = 1) => {
      const key = pointer ?? '';
      const prev = groupCounts.get(key) || 0;
      groupCounts.set(key, prev + amount);
    };

    filteredErrors.forEach((error) => {
      const pointer = normalizePointer(error);
      const message = error.error || 'Invalid value';
      const fieldNode = formModel?.getField(pointer);

      if (fieldNode) {
        // Only keep the first error per field
        if (!fieldErrors.has(pointer)) {
          fieldErrors.set(pointer, [message]);
          incrementGroupCount(fieldNode.groupPointer ?? '');
        }
      }
    });

    // Required field fallback: JSON Schema validators only report "required" errors when
    // a property is completely missing from an object. However, in forms, we want to
    // treat empty values (empty string "", null, empty array []) as invalid for required fields.
    // This fallback checks all required fields and adds validation errors for empty values
    // that the validator wouldn't catch (since the property exists, just with an empty value).
    if (document && formModel) {
      formModel.getFields().forEach((fieldNode) => {
        if (!fieldNode.required) return;
        // Skip if field already has an error
        if (fieldErrors.has(fieldNode.pointer)) return;
        let value;
        try {
          value = fieldNode.pointer ? getPointerValue(fieldNode.pointer, document) : document;
        } catch {
          value = undefined;
        }
        if (!isEmptyValue(value)) return;
        fieldErrors.set(fieldNode.pointer, ['This field is required.']);
        incrementGroupCount(fieldNode.groupPointer ?? '');
      });
    }

    const totalErrors = Array.from(fieldErrors.values())
      .reduce((acc, list) => acc + list.length, 0);

    let firstFieldPointer = null;
    formModel?.getFields().some((fieldNode) => {
      if (fieldErrors.has(fieldNode.pointer)) {
        firstFieldPointer = fieldNode.pointer;
        return true;
      }
      return false;
    });

    const state = new ValidationState({
      fieldErrors,
      groupErrors: new Map(), // Not used, but kept for API compatibility
      groupCounts,
      totalErrors,
      firstFieldPointer,
      firstGroupPointer: null, // Not used, but kept for API compatibility
      rawErrors: filteredErrors,
    });

    return state;
  }

  toEventDetail() {
    return {
      totalErrors: this.totalErrors,
      firstFieldPointer: this.firstFieldPointer,
      firstGroupPointer: this.firstGroupPointer,
      groupCounts: mapToObject(this.groupCounts),
    };
  }
}

export default ValidationState;
