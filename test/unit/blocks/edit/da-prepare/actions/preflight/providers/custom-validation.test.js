import { expect } from '@esm-bundle/chai';
import { canvasBus } from '../../../../../../../../blocks/canvas/utils/canvas-bus.js';
import customValidationProvider, { buildProjectValidationChecks } from '../../../../../../../../blocks/edit/da-prepare/actions/preflight/providers/custom-validation.js';

describe('buildProjectValidationChecks', () => {
  it('treats a missing payload like no custom validation registered', () => {
    expect(buildProjectValidationChecks()).to.equal(null);
  });

  it('is null when no custom validation is registered', () => {
    expect(buildProjectValidationChecks({ results: [], hasCustomValidation: false }))
      .to.equal(null);
  });

  it('shows a success status line when custom validation reports no issues', () => {
    const checks = buildProjectValidationChecks({ results: [], hasCustomValidation: true });
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
    const checks = buildProjectValidationChecks({ results, hasCustomValidation: true });
    expect(checks.map((check) => check.title)).to.deep.equal(['Alt text', 'SEO']);
    expect(checks[0].items.map((item) => item.result)).to.deep.equal(['warn', 'error']);
    expect(checks[0].items.map((item) => item.reason)).to.deep.equal(['Missing alt text', 'Broken image']);
    expect(checks[1].items[0].result).to.equal('info');
    expect(checks[1].items[0].reason).to.equal('Looks fine');
  });

  it('omits items with an invalid severity instead of surfacing them as an error', () => {
    const results = [
      { title: 'Alt text', severity: 'warn', message: 'Missing alt text' },
      { title: 'Alt text', severity: 'fatal', message: 'Broken image' },
    ];
    const checks = buildProjectValidationChecks({ results, hasCustomValidation: true });

    expect(checks[0].items).to.have.length(1);
    expect(checks[0].items[0].reason).to.equal('Missing alt text');
  });

  it('falls back to the success state when every result has an invalid severity', () => {
    const results = [{ title: 'Alt text', severity: 'fatal', message: 'Broken image' }];
    const checks = buildProjectValidationChecks({ results, hasCustomValidation: true });

    expect(checks).to.have.length(1);
    expect(checks[0].items[0].result).to.equal('success');
    expect(checks[0].items[0].reason).to.equal('No custom-validation issues found.');
  });

  it('defaults a missing message to an empty string', () => {
    const results = [{ title: 'Alt text', severity: 'warn' }];
    const checks = buildProjectValidationChecks({ results, hasCustomValidation: true });

    expect(checks[0].items[0].result).to.equal('warn');
    expect(checks[0].items[0].reason).to.equal('');
  });

  it('falls back to "Custom validation" when a result has no title', () => {
    const results = [{ severity: 'info', message: 'no title here' }];
    const checks = buildProjectValidationChecks({ results, hasCustomValidation: true });
    expect(checks[0].title).to.equal('Custom validation');
  });
});

describe('runCustomValidationProvider', () => {
  // getResults() no-ops unless a host (ew-editor-wysiwyg.js) has announced readiness --
  // reset to ready before every test so ordering doesn't matter, then the one test that
  // cares about the unready case overrides it within its own body.
  beforeEach(() => {
    canvasBus.validationHostReady.emit(true);
  });

  it('resolves immediately without emitting when no EW/canvas host is ready (e.g. classic /edit)', async () => {
    canvasBus.validationHostReady.emit(false);
    let runRequests = 0;
    const unsub = canvasBus.validationRunRequest.subscribe(() => { runRequests += 1; });

    const result = await customValidationProvider.getResults({});

    expect(result).to.deep.equal([]);
    expect(runRequests).to.equal(0);
    unsub();
  });

  it('returns immediately and does not emit when the signal is already aborted', async () => {
    let runRequests = 0;
    const unsub = canvasBus.validationRunRequest.subscribe(() => { runRequests += 1; });

    const result = await customValidationProvider.getResults({ signal: AbortSignal.abort() });

    expect(result).to.deep.equal([]);
    expect(runRequests).to.equal(0);
    unsub();
  });

  it('emits validationRunRequest and resolves with the broadcast result', async () => {
    let runRequests = 0;
    const unsub = canvasBus.validationRunRequest.subscribe(() => { runRequests += 1; });

    const resultPromise = customValidationProvider.getResults({});
    expect(runRequests).to.equal(1);
    canvasBus.validationResultState.emit({ items: [], hasCustomValidation: false });

    expect(await resultPromise).to.deep.equal([]);
    unsub();
  });

  it('resolves with null and stops listening once the abort signal fires', async () => {
    const controller = new AbortController();
    const resultPromise = customValidationProvider.getResults({ signal: controller.signal });
    controller.abort();
    expect(await resultPromise).to.deep.equal([]);

    const lateResult = { items: [], hasCustomValidation: false };
    expect(() => canvasBus.validationResultState.emit(lateResult)).to.not.throw();
  });

  it('treats a malformed broadcast payload like no custom validation registered', async () => {
    const resultPromise = customValidationProvider.getResults({});
    canvasBus.validationResultState.emit();

    expect(await resultPromise).to.deep.equal([]);
  });
});
