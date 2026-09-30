// Test stub for da-nx `nx2/utils/preflight-events.js`.
export const PREFLIGHT_EVENT = Object.freeze({
  RUN: 'nx-preflight-run',
  STATUS: 'nx-preflight-status',
});

export function newPreflightRequestId() {
  return `pf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
