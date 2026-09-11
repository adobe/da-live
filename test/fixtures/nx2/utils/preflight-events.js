// Test fixture mirroring da-nx `nx2/utils/preflight-events.js`.
// da-live imports this at runtime via `${getNx2()}/utils/preflight-events.js`; in unit tests
// getNx2() resolves to `/test/fixtures/nx2`, so this stub stands in for the da-nx module.
export const PREFLIGHT_EVENT = Object.freeze({
  RUN: 'nx-preflight-run',
  STATUS: 'nx-preflight-status',
});

export function newPreflightRequestId() {
  return `pf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
