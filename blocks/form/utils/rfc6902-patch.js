import { JSONPointer } from '../../../deps/da-form/dist/index.js';
import { get as pointerGet, exists as pointerExists, splitPointer } from './rfc6901-pointer.js';

export const OP_REPLACE = 'replace';
export const OP_REMOVE = 'remove';
export const OP_ADD = 'add';
export const OP_MOVE = 'move';

/**
 * RFC 6902 JSON Patch operations.
 * Apply add, remove, and replace operations using RFC 6901 pointers.
 */

function omitKey(obj, key) {
  const { [key]: _omit, ...rest } = obj || {};
  return rest;
}

function setAtPointer(pointer, document, value) {
  return JSONPointer.set(pointer, document, value);
}

function resolveParentAndKey(data, path) {
  const { parentPointer, key } = splitPointer(path);
  const parent = pointerGet(parentPointer, data);
  return { parent, parentPointer, key };
}

function arrayIndexForAdd(key, length) {
  if (key === '-') return length;
  const i = Number(key);
  if (!Number.isInteger(i)) throw new TypeError(`RFC6902 add: array index invalid '${key}'`);
  if (i < 0 || i > length) throw new TypeError(`RFC6902 add: array index out of bounds ${i} (length ${length})`);
  return i;
}

function applyReplace(json, operation) {
  const { data } = json;
  const { path, value } = operation;
  if (!pointerExists(path, data)) {
    throw new TypeError(`RFC6902 replace: target path missing '${path}'`);
  }
  const nextData = setAtPointer(path, data, value);
  return { ...json, data: nextData };
}

function applyRemove(json, operation) {
  const { data } = json;
  const { path } = operation;
  const { parent, parentPointer, key } = resolveParentAndKey(data, path);
  if (!pointerExists(path, data)) {
    throw new TypeError(`RFC6902 remove: target path missing '${path}'`);
  }
  let nextParent;
  if (Array.isArray(parent)) {
    const idx = Number(key);
    nextParent = parent.slice(0, idx).concat(parent.slice(idx + 1));
  } else {
    nextParent = omitKey(parent, key);
  }
  const nextData = setAtPointer(parentPointer, data, nextParent);
  return { ...json, data: nextData };
}

function applyAdd(json, operation) {
  const { data } = json;
  const { path, value } = operation;
  const { parent, parentPointer, key } = resolveParentAndKey(data, path);
  if (Array.isArray(parent)) {
    const index = arrayIndexForAdd(key, parent.length);
    const nextParent = parent.slice(0, index).concat([value], parent.slice(index));
    const nextData = setAtPointer(parentPointer, data, nextParent);
    return { ...json, data: nextData };
  }
  const nextParent = { ...(parent || {}), [key]: value };
  const nextData = setAtPointer(parentPointer, data, nextParent);
  return { ...json, data: nextData };
}

function applyMove(json, operation) {
  const { data } = json;
  const { path, from, to } = operation;
  const { parent, parentPointer } = resolveParentAndKey(data, path);

  if (!Array.isArray(parent)) {
    throw new TypeError('RFC6902 move: target must be an array');
  }

  if (!Number.isInteger(from) || from < 0 || from >= parent.length) {
    throw new TypeError(`RFC6902 move: invalid from index ${from}`);
  }

  if (!Number.isInteger(to) || to < 0 || to >= parent.length) {
    throw new TypeError(`RFC6902 move: invalid to index ${to}`);
  }

  if (from === to) {
    return json; // No-op if moving to same position
  }

  // Remove item from original position
  const item = parent[from];
  const withoutItem = parent.slice(0, from).concat(parent.slice(from + 1));

  // Insert at new position
  const nextParent = withoutItem.slice(0, to).concat([item], withoutItem.slice(to));
  const nextData = setAtPointer(parentPointer, data, nextParent);

  return { ...json, data: nextData };
}

export default function applyOp(json, operation) {
  if (operation.op === OP_REPLACE) return applyReplace(json, operation);
  if (operation.op === OP_REMOVE) return applyRemove(json, operation);
  if (operation.op === OP_ADD) return applyAdd(json, operation);
  if (operation.op === OP_MOVE) return applyMove(json, operation);
  return json;
}
