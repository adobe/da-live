import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../../../scripts/utils.js';

let loadProviderResults;
let createResult;
let SEVERITY;

before(async () => {
  // provider-registry.js imports the real ootb provider chain at module load time,
  // which needs an nx base configured even though these tests never call into it.
  setNx('/test/fixtures/nx', { hostname: 'example.com' });

  const registryMod = await import(
    '../../../../../../../../blocks/edit/da-prepare/actions/preflight/providers/provider-registry.js'
  );
  loadProviderResults = registryMod.loadProviderResults;

  const resultMod = await import(
    '../../../../../../../../blocks/edit/da-prepare/actions/preflight/views/result.js'
  );
  createResult = resultMod.createResult;
  SEVERITY = resultMod.SEVERITY;
});

function fakeProvider(id, getResults) {
  return { id, getResults };
}

function doneCheck(title, result, reason) {
  const item = createResult();
  item.settle(result, reason);
  return { title, items: [item], done: true };
}

describe('loadProviderResults', () => {
  it('passes a single provider\'s categories through unchanged', async () => {
    const providers = [
      fakeProvider('a', async () => [
        { title: 'Content', checks: [doneCheck('H1', SEVERITY.INFO, 'ok')] },
      ]),
    ];

    const categories = await loadProviderResults({ details: {}, providers });

    expect(categories).to.have.length(1);
    expect(categories[0].title).to.equal('Content');
    expect(categories[0].checks.map((c) => c.title)).to.deep.equal(['H1']);
  });

  it('merges categories with the same title from different providers', async () => {
    const providers = [
      fakeProvider('a', async () => [
        { title: 'Content', checks: [doneCheck('H1', SEVERITY.INFO, 'ok')] },
      ]),
      fakeProvider('b', async () => [
        { title: 'Content', checks: [doneCheck('Lorem ipsum', SEVERITY.INFO, 'ok')] },
      ]),
    ];

    const categories = await loadProviderResults({ details: {}, providers });

    expect(categories).to.have.length(1);
    expect(categories[0].title).to.equal('Content');
    expect(categories[0].checks.map((c) => c.title)).to.deep.equal(['H1', 'Lorem ipsum']);
  });

  it('isolates a provider that rejects into its own Errors category', async () => {
    const providers = [
      fakeProvider('a', async () => [
        { title: 'Content', checks: [doneCheck('H1', SEVERITY.INFO, 'ok')] },
      ]),
      fakeProvider('broken', async () => { throw new Error('boom'); }),
    ];

    const categories = await loadProviderResults({ details: {}, providers });

    expect(categories.map((c) => c.title)).to.deep.equal(['Content', 'Errors']);
    const errors = categories.find((c) => c.title === 'Errors');
    expect(errors.checks).to.have.length(1);
    expect(errors.checks[0].title).to.equal('broken');
    expect(errors.checks[0].done).to.be.true;
    expect(errors.checks[0].items[0].result).to.equal('error');
    expect(errors.checks[0].items[0].reason).to.equal('boom');
  });

  it('isolates a provider that throws synchronously the same as a rejection', async () => {
    const providers = [
      fakeProvider('broken', () => { throw new Error('sync boom'); }),
    ];

    const categories = await loadProviderResults({ details: {}, providers });

    expect(categories).to.have.length(1);
    expect(categories[0].title).to.equal('Errors');
    expect(categories[0].checks[0].items[0].reason).to.equal('sync boom');
  });

  it('rejects when a fulfilled provider violates the result-shape contract', async () => {
    const providers = [
      fakeProvider('a', async () => [
        { title: 'Content', checks: [doneCheck('H1', SEVERITY.INFO, 'ok')] },
      ]),
      fakeProvider('malformed', async () => undefined),
    ];

    let error;
    try {
      await loadProviderResults({ details: {}, providers });
    } catch (e) {
      error = e;
    }

    expect(error).to.be.an('error');
  });

  it('does not block on a provider whose getResults() never settles', async () => {
    const controller = new AbortController();
    const providers = [
      fakeProvider('a', async () => [
        { title: 'Content', checks: [doneCheck('H1', SEVERITY.INFO, 'ok')] },
      ]),
      fakeProvider('stuck', () => new Promise(() => {})),
    ];

    const resultPromise = loadProviderResults({
      details: {},
      providers,
      signal: controller.signal,
    });
    // Let the fast provider actually resolve before the signal aborts, so only the
    // hung one gets treated as timed out.
    await new Promise((resolve) => { setTimeout(resolve, 10); });
    controller.abort();
    const categories = await resultPromise;

    expect(categories.map((c) => c.title)).to.deep.equal(['Content', 'Errors']);
    const errors = categories.find((c) => c.title === 'Errors');
    expect(errors.checks[0].title).to.equal('stuck');
    expect(errors.checks[0].items[0].reason).to.equal('Timed out waiting for this check.');
  });

  it('force-settles items still pending when the signal aborts', async () => {
    const pendingItem = createResult();
    const providers = [
      fakeProvider('a', async () => [
        { title: 'Content', checks: [{ title: 'Slow check', items: [pendingItem], done: false }] },
      ]),
    ];

    let updateCalled = false;
    const categories = await loadProviderResults({
      details: {},
      providers,
      signal: AbortSignal.abort(),
      onUpdate: () => { updateCalled = true; },
    });

    const check = categories[0].checks[0];
    expect(check.done).to.be.true;
    expect(check.items[0].status).to.equal('done');
    expect(check.items[0].result).to.equal('error');
    expect(check.items[0].reason).to.equal('Timed out waiting for this check.');
    expect(updateCalled).to.be.true;
  });

  it('does not hang forever on a never-settling provider when the signal is already aborted', async () => {
    const providers = [
      fakeProvider('a', async () => [
        { title: 'Content', checks: [doneCheck('H1', SEVERITY.INFO, 'ok')] },
      ]),
      fakeProvider('stuck', () => new Promise(() => {})),
    ];

    const categories = await loadProviderResults({
      details: {},
      providers,
      signal: AbortSignal.abort(),
    });

    expect(categories.map((c) => c.title)).to.deep.equal(['Content', 'Errors']);
    const errors = categories.find((c) => c.title === 'Errors');
    expect(errors.checks[0].title).to.equal('stuck');
    expect(errors.checks[0].items[0].reason).to.equal('Timed out waiting for this check.');
  });
});
