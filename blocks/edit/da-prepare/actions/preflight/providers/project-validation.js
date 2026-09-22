import { canvasBus } from '../../../../../canvas/utils/canvas-bus.js';
import { createResult, SEVERITY } from '../views/result.js';

const CATEGORY = 'Custom';

export function buildProjectValidationChecks({ results, hasRunner }) {
  if (!hasRunner) return null;

  if (results.length === 0) {
    const item = createResult();
    item.settle(SEVERITY.SUCCESS, SEVERITY.SUCCESS, 'No custom-validation issues found.');
    return [{ title: 'Custom validation', items: [item], done: true }];
  }

  const groups = Object.groupBy(results, (item) => item.title ?? 'Custom validation');
  return Object.entries(groups).map(([title, items]) => ({
    title,
    items: items.map(({ severity, message }) => {
      const item = createResult();
      item.settle(severity, severity, message);
      return item;
    }),
    done: true,
  }));
}

async function getResults({ signal } = {}) {
  return new Promise((resolve) => {
    const unsubscribe = canvasBus.validationResultState.subscribe((detail) => {
      unsubscribe();
      const { items, hasRunner } = detail;
      const checks = buildProjectValidationChecks({ results: items, hasRunner }) ?? [];
      resolve(checks.length ? [{ title: CATEGORY, checks }] : []);
    });

    signal?.addEventListener('abort', () => {
      unsubscribe();
      resolve([]);
    });

    canvasBus.validationRunRequest.emit();
  });
}

export default { id: 'project-validation', getResults };
