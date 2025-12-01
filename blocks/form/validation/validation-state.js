import { append, splitPointer, get as getPointerValue } from '../utils/rfc6901-pointer.js';

const REQUIRED_PROPERTY_RE = /"([^"]+)"/;

function mapToObject(map) {
  const out = {};
  map.forEach((value, key) => {
    out[key ?? ''] = value;
  });
  return out;
}

function bubbleCounts(groupPointer, registry, groupCounts, amount) {
  let current = groupPointer;
  while (current != null) {
    const prev = groupCounts.get(current) || 0;
    groupCounts.set(current, prev + amount);
    const parent = registry.groupMap.get(current)?.parentPointer;
    if (parent == null || parent === current) break;
    current = parent;
  }
}

function normalizePointer(error) {
  let pointer = error.instanceLocation ?? '';
  if (pointer.startsWith('#')) {
    pointer = pointer.slice(1);
  }
  if (pointer !== '' && !pointer.startsWith('/')) {
    pointer = `/${pointer}`;
  }
  if (error.keyword === 'required') {
    const missing = REQUIRED_PROPERTY_RE.exec(error.error || '');
    if (missing && missing[1]) {
      pointer = append(pointer, missing[1]);
    }
  }
  return pointer;
}

function resolveGroupPointer(pointer, registry) {
  if (registry.groupMap.has(pointer)) return pointer;
  let current = pointer;
  while (current) {
    const { parentPointer } = splitPointer(current);
    if (!parentPointer && parentPointer !== '') break;
    if (registry.groupMap.has(parentPointer)) return parentPointer;
    current = parentPointer;
  }
  return '';
}

function isEmptyValue(value) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

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

  static fromResult(result, registry, document) {
    if (!result) return ValidationState.empty();

    const rawErrors = Array.isArray(result.errors) ? result.errors : [];
    if (rawErrors.length === 0) return ValidationState.empty();

    const fieldErrors = new Map();
    const groupErrors = new Map();
    const groupCounts = new Map();

    rawErrors.forEach((error) => {
      const pointer = normalizePointer(error);
      const message = error.error || 'Invalid value';
      const fieldMeta = registry.fieldMap?.get(pointer);

      if (fieldMeta) {
        const next = fieldErrors.get(pointer) || [];
        next.push(message);
        fieldErrors.set(pointer, next);
        bubbleCounts(fieldMeta.groupPointer ?? '', registry, groupCounts, 1);
        return;
      }

      const groupPointer = resolveGroupPointer(pointer, registry);
      const next = groupErrors.get(groupPointer) || [];
      next.push(message);
      groupErrors.set(groupPointer, next);
      bubbleCounts(groupPointer, registry, groupCounts, 1);
    });

    if (document && registry?.fields) {
      registry.fields.forEach((field) => {
        if (!field.required) return;
        let value;
        try {
          value = field.pointer ? getPointerValue(field.pointer, document) : document;
        } catch {
          value = undefined;
        }
        if (!isEmptyValue(value)) return;
        const next = fieldErrors.get(field.pointer) || [];
        next.push('This field is required.');
        fieldErrors.set(field.pointer, next);
        bubbleCounts(field.groupPointer ?? '', registry, groupCounts, 1);
      });
    }

    const totalFieldErrors = Array.from(fieldErrors.values())
      .reduce((acc, list) => acc + list.length, 0);
    const totalGroupErrors = Array.from(groupErrors.values())
      .reduce((acc, list) => acc + list.length, 0);
    const totalErrors = totalFieldErrors + totalGroupErrors;

    let firstFieldPointer = null;
    registry.fields?.some((field) => {
      if (fieldErrors.has(field.pointer)) {
        firstFieldPointer = field.pointer;
        return true;
      }
      return false;
    });

    const firstGroupPointer = firstFieldPointer
      ? null
      : (groupErrors.keys().next().value ?? null);

    return new ValidationState({
      fieldErrors,
      groupErrors,
      groupCounts,
      totalErrors,
      firstFieldPointer,
      firstGroupPointer,
      rawErrors,
    });
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

