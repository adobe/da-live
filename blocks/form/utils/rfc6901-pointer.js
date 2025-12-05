/**
 * RFC 6901 JSON Pointer utilities.
 * Wrapper around JSONPointer library for common pointer operations.
 */
import { JSONPointer } from '../../../deps/da-form/dist/index.js';

const { nil, pointerSegments } = JSONPointer;

/** Append a segment to a pointer. */
export function append(pointer, segment) {
  return JSONPointer.append(segment, pointer);
}

/** Split pointer into parent pointer and last token. */
export function splitPointer(pointer) {
  const segments = Array.from(pointerSegments(pointer));
  const parentPointer = segments.slice(0, -1).reduce(
    (acc, seg) => append(acc, seg),
    nil,
  );
  const token = segments.length ? segments[segments.length - 1] : '';
  const key = token;
  return { parentPointer, token, key };
}

/** Get value at pointer in document. */
export function get(pointer, document) {
  return JSONPointer.get(pointer, document);
}

/** Check if pointer exists in document. */
export function exists(pointer, document) {
  try {
    JSONPointer.get(pointer, document);
    return true;
  } catch {
    return false;
  }
}
