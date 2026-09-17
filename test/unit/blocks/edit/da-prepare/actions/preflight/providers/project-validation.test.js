import { expect } from '@esm-bundle/chai';
import { canvasBus } from '../../../../../../../../blocks/canvas/utils/canvas-bus.js';
import runProjectValidationProvider, { buildProjectValidationChecks } from '../../../../../../../../blocks/edit/da-prepare/actions/preflight/providers/project-validation.js';

describe('buildProjectValidationChecks', () => {
  it('is null when no runner is registered', () => {
    expect(buildProjectValidationChecks({ results: [], hasRunner: false }))
      .to.equal(null);
  });

  it('shows a success status line when the runner reports no issues', () => {
    const checks = buildProjectValidationChecks({ results: [], hasRunner: true });
    expect(checks).to.deep.equal([{
      category: 'Custom',
      title: 'Custom validation',
      results: [{ status: 'success', reason: 'No custom-validation issues found.' }],
    }]);
  });

  it('groups results by title', () => {
    const results = [
      { title: 'Alt text', severity: 'warn', message: 'Missing alt text' },
      { title: 'Alt text', severity: 'error', message: 'Broken image' },
      { title: 'SEO', severity: 'info', message: 'Looks fine' },
    ];
    const checks = buildProjectValidationChecks({ results, hasRunner: true });
    expect(checks).to.deep.equal([
      {
        category: 'Custom',
        title: 'Alt text',
        results: [
          { status: 'warn', reason: 'Missing alt text' },
          { status: 'error', reason: 'Broken image' },
        ],
      },
      {
        category: 'Custom',
        title: 'SEO',
        results: [{ status: 'info', reason: 'Looks fine' }],
      },
    ]);
  });

  it('falls back to "Custom validation" when a result has no title', () => {
    const results = [{ severity: 'info', message: 'no title here' }];
    const checks = buildProjectValidationChecks({ results, hasRunner: true });
    expect(checks[0].title).to.equal('Custom validation');
  });
});

describe('runProjectValidationProvider', () => {
  it('emits validationRunRequest and resolves with the broadcast result', async () => {
    let runRequests = 0;
    const unsub = canvasBus.validationRunRequest.subscribe(() => { runRequests += 1; });

    const resultPromise = runProjectValidationProvider();
    expect(runRequests).to.equal(1);
    canvasBus.validationResultState.emit({ items: [], hasRunner: false });

    expect(await resultPromise).to.equal(null);
    unsub();
  });

  it('resolves with null and stops listening once the abort signal fires', async () => {
    const controller = new AbortController();
    const resultPromise = runProjectValidationProvider(undefined, { signal: controller.signal });
    controller.abort();
    expect(await resultPromise).to.equal(null);

    // A late broadcast after abort must not throw or resolve anything new.
    const lateResult = { items: [], hasRunner: false };
    expect(() => canvasBus.validationResultState.emit(lateResult)).to.not.throw();
  });
});
