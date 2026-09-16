import { canvasBus } from '../../../../../canvas/utils/canvas-bus.js';

export function buildProjectValidationCategory({ results, timedOut, hasRunner }) {
  // No ACK ever arrived (host doesn't support this protocol), or a RESULT arrived
  // reporting no runner registered — don't show the category at all rather than an
  // empty/misleading one. hasRunner: null means "never ACK'd" (see canvas/utils/validation.js).
  if (timedOut && hasRunner === null) return null;
  if (!timedOut && hasRunner === false) return null;

  let checks;
  if (timedOut) {
    checks = [{
      title: 'Custom validation',
      results: [{ reason: 'Custom validation is taking too long to complete.', badge: 'warn' }],
    }];
  } else if (results.length === 0) {
    checks = [{
      title: 'Custom validation',
      results: [{ reason: 'No custom-validation issues found.', badge: 'success' }],
    }];
  } else {
    const groups = Object.groupBy(results, (item) => item.title ?? 'Custom validation');
    checks = Object.entries(groups).map(([title, items]) => ({
      title,
      results: items.map(({ severity, message }) => ({ reason: message, badge: severity })),
    }));
  }
  return { title: 'Custom', open: false, checks };
}

// Requests a run from ew-editor-wysiwyg.js over canvasBus (EW/canvas-only — see
// docs/canvas eventing notes) and resolves once it broadcasts a result or a timeout.
// `signal` lets DaPreflight cancel the wait (and the canvasBus subscription with it) if
// the component disconnects first.
export function runProjectValidationProvider(details, { signal } = {}) {
  return new Promise((resolve) => {
    const unsubscribe = canvasBus.validationResultState.subscribe((detail) => {
      unsubscribe();
      const { items, timedOut, hasRunner } = detail;
      resolve(buildProjectValidationCategory({ results: items, timedOut, hasRunner }));
    });
    signal?.addEventListener('abort', () => {
      unsubscribe();
      resolve(null);
    });
    canvasBus.validationRunRequest.emit();
  });
}
