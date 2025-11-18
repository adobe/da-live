import { JSONPointer } from '../../../deps/da-form/dist/index.js';

const { nil, pointerSegments } = JSONPointer;

export function append(pointer, segment) {
  return JSONPointer.append(segment, pointer);
}

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

export function get(pointer, document) {
  return JSONPointer.get(pointer, document);
}

export function exists(pointer, document) {
  try {
    JSONPointer.get(pointer, document);
    return true;
  } catch {
    return false;
  }
}
