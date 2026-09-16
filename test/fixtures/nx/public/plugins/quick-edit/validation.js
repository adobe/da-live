// Test stub for da-nx `nx/public/plugins/quick-edit/validation.js`.
export const MESSAGE_TYPES = Object.freeze({
  RUN: 'run',
  RESULT: 'result',
});

const VALIDATION_SEVERITIES = new Set(['success', 'info', 'warn', 'error']);

function isValidValidationItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (!VALIDATION_SEVERITIES.has(item.severity)) return false;
  if (typeof item.title !== 'string' || !item.title) return false;
  return typeof item.message === 'string';
}

export function sanitizeValidationItems(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(isValidValidationItem);
}
