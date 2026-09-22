import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
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
  // Must run before ew-editor-wysiwyg is ever defined below - customElements.define can't be
  // undone once registered, so this is the only place in the file that can exercise the
  // "no host could ever exist" (classic /edit) gate.
  it('resolves immediately without emitting when no EW/canvas host could ever exist (e.g. classic /edit)', async () => {
    expect(customElements.get('ew-editor-wysiwyg')).to.not.exist;
    let runRequests = 0;
    const unsub = canvasBus.validationRunRequest.subscribe(() => { runRequests += 1; });

    const result = await customValidationProvider.getResults({});

    expect(result).to.deep.equal([]);
    expect(runRequests).to.equal(0);
    unsub();
  });

  describe('when an EW/canvas host could exist', () => {
    before(() => {
      if (!customElements.get('ew-editor-wysiwyg')) {
        customElements.define('ew-editor-wysiwyg', class extends HTMLElement {});
      }
    });

    // getResults() no-ops unless the host has announced readiness -- reset to ready before
    // every test so ordering doesn't matter, then individual tests override it as needed.
    beforeEach(() => {
      canvasBus.validationHostReady.emit(true);
    });

    it('resolves empty if the host never announces ready within the grace window', async () => {
      canvasBus.validationHostReady.emit(false);
      const clock = sinon.useFakeTimers();
      try {
        const resultPromise = customValidationProvider.getResults({});
        await clock.tickAsync(1000);
        expect(await resultPromise).to.deep.equal([]);
      } finally {
        clock.restore();
      }
    });

    it('waits for a host that announces ready shortly after the run starts (mount-order race)', async () => {
      canvasBus.validationHostReady.emit(false);
      let runRequests = 0;
      const unsub = canvasBus.validationRunRequest.subscribe(() => { runRequests += 1; });

      const resultPromise = customValidationProvider.getResults({});
      canvasBus.validationHostReady.emit(true);
      // Resolving the internal host-ready wait still defers getResults()'s own continuation
      // to a microtask - flush one before it's expected to have emitted the run request.
      await Promise.resolve();
      expect(runRequests).to.equal(1);
      canvasBus.validationResultState.emit({ items: [], hasCustomValidation: false });

      expect(await resultPromise).to.deep.equal([]);
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
      // The already-ready host still resolves via a microtask (await always defers at least
      // once), so the run request isn't emitted synchronously within this call.
      await Promise.resolve();
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
      await Promise.resolve();
      canvasBus.validationResultState.emit();

      expect(await resultPromise).to.deep.equal([]);
    });
  });
});
