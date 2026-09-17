import { canvasBus } from '../../../../../canvas/utils/canvas-bus.js';

const CATEGORY = 'Custom';

export function buildProjectValidationChecks({ results, hasRunner }) {
  // No runner registered for this project — don't show the category at all rather than
  // an empty/misleading one.
  if (!hasRunner) return null;

  if (results.length === 0) {
    return [{
      category: CATEGORY,
      title: 'Custom validation',
      results: [{ status: 'success', reason: 'No custom-validation issues found.' }],
    }];
  }

  const groups = Object.groupBy(results, (item) => item.title ?? 'Custom validation');
  return Object.entries(groups).map(([title, items]) => ({
    category: CATEGORY,
    title,
    results: items.map(({ severity, message }) => ({ status: severity, reason: message })),
  }));
}

// Requests a run from ew-editor-wysiwyg.js over canvasBus (EW/canvas-only — see
// docs/canvas eventing notes) and resolves once it broadcasts a result. `signal` lets
// DaPreflight stop waiting (and unsubscribe) if the component disconnects, or preflight's
// own per-provider timeout elapses, first — the underlying validation request itself
// isn't cancelled, preflight just abandons waiting on it.
export default function runProjectValidation(details, { signal } = {}) {
  return new Promise((resolve) => {
    const unsubscribe = canvasBus.validationResultState.subscribe((detail) => {
      unsubscribe();
      const { items, hasRunner } = detail;
      resolve(buildProjectValidationChecks({ results: items, hasRunner }));
    });
    signal?.addEventListener('abort', () => {
      unsubscribe();
      resolve(null);
    });
    canvasBus.validationRunRequest.emit();
  });
}
