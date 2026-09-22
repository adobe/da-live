import { expect } from '@esm-bundle/chai';
import { canvasBus } from '../../../../../../../../blocks/canvas/utils/canvas-bus.js';
import projectValidationProvider, { buildProjectValidationChecks } from '../../../../../../../../blocks/edit/da-prepare/actions/preflight/providers/project-validation.js';

describe('buildProjectValidationChecks', () => {
  it('is null when no runner is registered', () => {
    expect(buildProjectValidationChecks({ results: [], hasRunner: false }))
      .to.equal(null);
  });

  it('shows a success status line when the runner reports no issues', () => {
    const checks = buildProjectValidationChecks({ results: [], hasRunner: true });
    expect(checks).to.have.length(1);
    expect(checks[0].title).to.equal('Custom validation');
    expect(checks[0].done).to.be.true;
    expect(checks[0].items[0].result).to.equal('success');
    expect(checks[0].items[0].reason).to.equal('No custom-validation issues found.');
  });

  it('groups results by title', () => {
    const results = [
      { title: 'Alt text', severity: 'warn', message: 'Missing alt text' },
      { title: 'Alt text', severity: 'error', message: 'Broken image' },
      { title: 'SEO', severity: 'info', message: 'Looks fine' },
    ];
    const checks = buildProjectValidationChecks({ results, hasRunner: true });
    expect(checks.map((check) => check.title)).to.deep.equal(['Alt text', 'SEO']);
    expect(checks[0].items.map((item) => item.result)).to.deep.equal(['warn', 'error']);
    expect(checks[0].items.map((item) => item.reason)).to.deep.equal(['Missing alt text', 'Broken image']);
    expect(checks[1].items[0].result).to.equal('info');
    expect(checks[1].items[0].reason).to.equal('Looks fine');
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

    const resultPromise = projectValidationProvider.getResults({});
    expect(runRequests).to.equal(1);
    canvasBus.validationResultState.emit({ items: [], hasRunner: false });

    expect(await resultPromise).to.deep.equal([]);
    unsub();
  });

  it('resolves with null and stops listening once the abort signal fires', async () => {
    const controller = new AbortController();
    const resultPromise = projectValidationProvider.getResults({ signal: controller.signal });
    controller.abort();
    expect(await resultPromise).to.deep.equal([]);

    const lateResult = { items: [], hasRunner: false };
    expect(() => canvasBus.validationResultState.emit(lateResult)).to.not.throw();
  });
});
