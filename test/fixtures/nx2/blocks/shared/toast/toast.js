// Test fixture mirroring nx2/blocks/shared/toast/toast.js.
export const toasts = [];

export function showToast(opts) {
  toasts.push(opts);
}
