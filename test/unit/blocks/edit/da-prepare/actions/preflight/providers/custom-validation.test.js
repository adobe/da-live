import { expect } from '@esm-bundle/chai';
import { canvasBus } from '../../../../../../../../blocks/canvas/utils/canvas-bus.js';
import {
  buildCustomValidationCategory,
  runCustomValidationProvider,
} from '../../../../../../../../blocks/edit/da-prepare/actions/preflight/providers/custom-validation.js';

describe('buildCustomValidationCategory', () => {
  it('is null when no ACK ever arrived (old host/no quick-edit here)', () => {
    expect(buildCustomValidationCategory({ results: null, timedOut: true, hasRunner: null }))
      .to.equal(null);
  });

  it('is null when a RESULT arrives reporting no runner registered', () => {
    expect(buildCustomValidationCategory({ results: [], timedOut: false, hasRunner: false }))
      .to.equal(null);
  });

  it('shows a "taking too long" status line when ACK\'d but RESULT never arrives', () => {
    const cat = buildCustomValidationCategory({ results: null, timedOut: true, hasRunner: true });
    expect(cat.title).to.equal('Custom');
    expect(cat.checks).to.deep.equal([{
      title: 'Custom validation',
      results: [{ reason: 'Custom validation is taking too long to complete.', badge: 'warn' }],
    }]);
  });

  it('shows a success status line when the runner reports no issues', () => {
    const cat = buildCustomValidationCategory({ results: [], timedOut: false, hasRunner: true });
    expect(cat.checks).to.deep.equal([{
      title: 'Custom validation',
      results: [{ reason: 'No custom-validation issues found.', badge: 'success' }],
    }]);
  });

  it('groups results by title', () => {
    const results = [
      { title: 'Alt text', severity: 'warn', message: 'Missing alt text' },
      { title: 'Alt text', severity: 'error', message: 'Broken image' },
      { title: 'SEO', severity: 'info', message: 'Looks fine' },
    ];
    const cat = buildCustomValidationCategory({ results, timedOut: false, hasRunner: true });
    expect(cat.checks).to.deep.equal([
      {
        title: 'Alt text',
        results: [
          { reason: 'Missing alt text', badge: 'warn' },
          { reason: 'Broken image', badge: 'error' },
        ],
      },
      { title: 'SEO', results: [{ reason: 'Looks fine', badge: 'info' }] },
    ]);
  });

  it('falls back to "Custom validation" when a result has no title', () => {
    const results = [{ severity: 'info', message: 'no title here' }];
    const cat = buildCustomValidationCategory({ results, timedOut: false, hasRunner: true });
    expect(cat.checks[0].title).to.equal('Custom validation');
  });
});

describe('runCustomValidationProvider', () => {
  it('emits validationRunRequest and resolves with the broadcast result', async () => {
    let runRequests = 0;
    const unsub = canvasBus.validationRunRequest.subscribe(() => { runRequests += 1; });

    const resultPromise = runCustomValidationProvider();
    expect(runRequests).to.equal(1);
    canvasBus.validationResultState.emit({ items: [], timedOut: false, hasRunner: false });

    expect(await resultPromise).to.equal(null);
    unsub();
  });

  it('resolves with null and stops listening once the abort signal fires', async () => {
    const controller = new AbortController();
    const resultPromise = runCustomValidationProvider(undefined, { signal: controller.signal });
    controller.abort();
    expect(await resultPromise).to.equal(null);

    // A late broadcast after abort must not throw or resolve anything new.
    const lateResult = { items: [], timedOut: false, hasRunner: false };
    expect(() => canvasBus.validationResultState.emit(lateResult)).to.not.throw();
  });
});
