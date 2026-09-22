import { canvasBus } from '../../../../../canvas/utils/canvas-bus.js';
import { createResult, SEVERITY } from '../views/result.js';

const CATEGORY = 'Custom';
const ALLOWED_SEVERITIES = new Set(Object.values(SEVERITY));

function toPreflightItem({ severity, message }) {
  const item = createResult();
  item.settle(severity, severity, message || '');
  return item;
}

export function buildProjectValidationChecks({ results = [], hasCustomValidation } = {}) {
  if (!hasCustomValidation) return null;

  // Invalid severities are silently dropped rather than surfaced as an error item --
  // the allowed vocabulary is a preflight concern, not da-nx's to validate.
  const validResults = results.filter(({ severity } = {}) => ALLOWED_SEVERITIES.has(severity));

  if (validResults.length === 0) {
    const item = createResult();
    item.settle(SEVERITY.SUCCESS, SEVERITY.SUCCESS, 'No custom-validation issues found.');
    return [{ title: 'Custom validation', items: [item], done: true }];
  }

  const groups = Object.groupBy(validResults, (item) => item.title ?? 'Custom validation');
  return Object.entries(groups).map(([title, items]) => ({
    title,
    items: items.map(toPreflightItem),
    done: true,
  }));
}

async function getResults({ signal } = {}) {
  if (signal?.aborted) return [];

  return new Promise((resolve) => {
    const unsubscribe = canvasBus.validationResultState.subscribe((detail) => {
      unsubscribe();
      const { items = [], hasCustomValidation = false } = detail || {};
      const checks = buildProjectValidationChecks({ results: items, hasCustomValidation }) ?? [];
      resolve(checks.length ? [{ title: CATEGORY, checks }] : []);
    });

    signal?.addEventListener('abort', () => {
      unsubscribe();
      resolve([]);
    }, { once: true });

    canvasBus.validationRunRequest.emit();
  });
}

export default { id: 'custom-validation', getResults };
