// Test stub for da-nx `nx/public/plugins/quick-edit/custom-validation.js`.
export const MESSAGE_TYPES = Object.freeze({
  RUN: 'run',
  ACK: 'ack',
  RESULT: 'result',
});

function isValidCustomValidationItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (typeof item.severity !== 'string' || !item.severity) return false;
  if (typeof item.title !== 'string' || !item.title) return false;
  return typeof item.message === 'string';
}

export function sanitizeCustomValidationItems(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(isValidCustomValidationItem);
}
