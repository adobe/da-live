// Test fixture mirroring nx2/blocks/shared/toast/toast.js.
// The array is parked on window because the import-maps plugin can load this
// module twice, once per specifier shape, and both copies have to record here.
window.daTestToasts ??= [];

export const toasts = window.daTestToasts;

export function showToast(opts) {
  window.daTestToasts.push(opts);
}
