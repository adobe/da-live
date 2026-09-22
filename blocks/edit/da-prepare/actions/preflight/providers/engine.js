import { STATUS, SEVERITY, createResult } from '../views/result.js';

// Shared by /edit's dialog and canvas's panel so a hung provider can't spin either host
// forever, and so both hosts give up at the same point.
export const LOAD_TIMEOUT_MS = 30 * 1000;

export function isItemSettled(item) {
  if (!item) return false;
  return item.status === STATUS.DONE;
}

// NA means the check doesn't apply to this page - not a real finding, so once settled
// it's hidden rather than shown as an empty/unstyled badge. A still-pending item isn't
// hidden yet, since it needs to keep showing progress until it settles.
export function isHiddenItem(item) {
  return isItemSettled(item) && item.result === SEVERITY.NA;
}

export function buildLoadErrorCategories(err) {
  const item = createResult();
  item.settle(SEVERITY.ERROR, err?.message || 'Failed to load preflight results.');

  return [{
    title: 'Errors',
    checks: [{ title: 'Preflight', items: [item], done: true }],
  }];
}

// Returns 'success' | 'fail' once every check item across every category has settled, or
// undefined while still pending. Shared so /edit's dialog and canvas's panel can never
// disagree about what counts as an overall pass (used to gate publish).
export function computeOverallStatus(categories) {
  const checks = categories.flatMap((category) => category.checks);
  const complete = checks.every((check) => check.done
    && check.items.every((item) => isItemSettled(item)));
  if (!complete) return undefined;

  const outcomes = checks.flatMap((check) => check.items.map((item) => item.result));
  return outcomes.includes(SEVERITY.ERROR) ? 'fail' : 'success';
}
