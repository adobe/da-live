import { STATUS, SEVERITY, createResult } from '../views/result.js';

// Shared by /edit's dialog and canvas's panel so a hung provider can't spin either host
// forever, and so both hosts give up at the same point.
export const LOAD_TIMEOUT_MS = 30 * 1000;

export function isItemSettled(item) {
  if (!item) return false;
  return item.status === STATUS.DONE;
}

// NA isn't a real finding, so hide it once settled rather than show an empty badge.
// Still-pending items stay visible to show progress.
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

// 'success' | 'fail' once every item has settled, else undefined. Shared so /edit's
// dialog and canvas's panel never disagree on what counts as a pass (gates publish).
export function computeOverallStatus(categories) {
  const checks = categories.flatMap((category) => category.checks);
  const complete = checks.every((check) => check.done
    && check.items.every((item) => isItemSettled(item)));
  if (!complete) return undefined;

  const outcomes = checks.flatMap((check) => check.items.map((item) => item.result));
  return outcomes.includes(SEVERITY.ERROR) ? 'fail' : 'success';
}
