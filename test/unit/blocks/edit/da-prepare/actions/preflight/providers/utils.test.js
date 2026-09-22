import { expect } from '@esm-bundle/chai';
import { runCheck } from '../../../../../../../../blocks/edit/da-prepare/actions/preflight/providers/utils.js';

describe('runCheck', () => {
  it('returns the check result unchanged when it succeeds', async () => {
    const result = await runCheck(() => ({ title: 'Fine', items: [], done: true }), {});

    expect(result).to.deep.equal({ title: 'Fine', items: [], done: true });
  });

  it('isolates a throwing check into its own errored result instead of propagating', async () => {
    function brokenCheck() { throw new Error('h1 exploded'); }

    const result = await runCheck(brokenCheck, {});

    expect(result.title).to.equal('brokenCheck');
    expect(result.done).to.be.true;
    expect(result.items).to.have.length(1);
    expect(result.items[0].result).to.equal('error');
    expect(result.items[0].reason).to.equal('h1 exploded');
  });

  it('falls back to a generic title for an anonymous throwing check', async () => {
    const result = await runCheck(() => { throw new Error('boom'); }, {});

    expect(result.title).to.equal('Unknown check');
  });

  it('awaits an async check and returns its resolved result', async () => {
    async function asyncCheck() {
      return { title: 'Async check', items: [], done: true };
    }

    const result = await runCheck(asyncCheck, {});

    expect(result).to.deep.equal({ title: 'Async check', items: [], done: true });
  });

  it('isolates an async check that rejects the same as a synchronous throw', async () => {
    async function brokenAsyncCheck() { throw new Error('async boom'); }

    const result = await runCheck(brokenAsyncCheck, {});

    expect(result.title).to.equal('brokenAsyncCheck');
    expect(result.done).to.be.true;
    expect(result.items[0].result).to.equal('error');
    expect(result.items[0].reason).to.equal('async boom');
  });
});
