/**
 * Path/ID helpers used across Form UI
 */

export function hyphenatePath(path) {
  return String(path || '').replace(/[.\[\]]/g, '-');
}

export function pathToGroupId(path) {
  return `form-group-${hyphenatePath(path)}`;
}

export function arrayItemId(arrayPath, index) {
  return `form-array-item-${hyphenatePath(arrayPath)}-${index}`;
}

// Additional helpers for path normalization
export function toBracketPath(dotPath) {
  // user.addresses.0.street => user.addresses[0].street
  return String(dotPath).replace(/\.(\d+)(?=\.|$)/g, '[$1]');
}

export function toDotPath(bracketPath) {
  // user.addresses[0].street => user.addresses.0.street
  return String(bracketPath).replace(/\[(\d+)\]/g, '.$1');
}

export function isArrayPath(path) {
  return /\[\d+\]/.test(String(path));
}

export function parentPath(path) {
  const dot = toDotPath(path);
  if (!dot) return '';
  if (/.+\.(\d+)$/.test(dot)) return dot.replace(/\.(\d+)$/, '');
  const idx = dot.lastIndexOf('.');
  return idx >= 0 ? dot.slice(0, idx) : '';
}
