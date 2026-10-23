import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { createSourcePersistence } from '../../../../blocks/shared/source-persistence.js';

describe('direct-source persistence', () => {
  let clock;
  let save;
  let onState;
  let persistence;

  beforeEach(() => {
    clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    save = sinon.stub().resolves(new Response('', { status: 200 }));
    onState = sinon.spy();
    persistence = createSourcePersistence({ initialBody: 'Initial', save, onState });
  });

  afterEach(() => sinon.restore());

  it('debounces edits and saves only the latest snapshot', async () => {
    persistence.schedule('First');
    await clock.tickAsync(900);
    persistence.schedule('Latest');
    await clock.tickAsync(999);
    expect(save.called).to.be.false;
    expect(persistence.hasPending).to.be.true;
    await clock.tickAsync(1);
    expect(save.calledOnceWithExactly('Latest')).to.be.true;
    expect(persistence.hasPending).to.be.false;
    expect(onState.lastCall.args[0]).to.deep.equal({ status: 'saved' });
  });

  it('does not save a clean document or an edit reverted before saving', async () => {
    expect(await persistence.flush()).to.deep.equal({ ok: true });
    persistence.schedule('Edited');
    persistence.schedule('Initial');
    await clock.tickAsync(1000);
    expect(save.called).to.be.false;
    expect(persistence.hasPending).to.be.false;
  });

  it('serializes saves and flushes edits made during an in-flight save', async () => {
    let finishFirst;
    save.onFirstCall().returns(new Promise((resolve) => { finishFirst = resolve; }));
    persistence.schedule('First');
    const firstFlush = persistence.flush();
    persistence.schedule('Latest');
    expect(persistence.flush()).to.equal(firstFlush);
    expect(save.calledOnceWithExactly('First')).to.be.true;
    finishFirst(new Response('', { status: 200 }));
    expect(await firstFlush).to.deep.equal({ ok: true });
    expect(save.secondCall.args).to.deep.equal(['Latest']);
    expect(persistence.hasPending).to.be.false;
  });

  it('saves a revert made while the original edit is being written', async () => {
    let finishFirst;
    save.onFirstCall().returns(new Promise((resolve) => { finishFirst = resolve; }));
    persistence.schedule('Edited');
    const flush = persistence.flush();
    persistence.schedule('Initial');
    expect(persistence.hasPending).to.be.true;
    finishFirst(new Response('', { status: 200 }));
    await flush;
    expect(save.secondCall.args).to.deep.equal(['Initial']);
    expect(persistence.hasPending).to.be.false;
  });

  it('retains failed edits, surfaces server errors, and retries', async () => {
    save.onFirstCall().resolves(new Response('', { status: 403, headers: { 'x-error': 'Write denied' } }));
    persistence.schedule('Edited');
    const failed = await persistence.flush();
    expect(failed.ok).to.be.false;
    expect(failed.error).to.include('403').and.include('Write denied');
    expect(persistence.hasPending).to.be.true;
    expect(onState.lastCall.args[0]).to.deep.equal({ status: 'error', error: failed.error });
    expect(await persistence.flush()).to.deep.equal({ ok: true });
    expect(save.secondCall.args).to.deep.equal(['Edited']);
    expect(persistence.hasPending).to.be.false;
  });

  it('reports network errors without claiming success', async () => {
    save.rejects(new Error('Network unavailable'));
    persistence.schedule('Edited');
    expect(await persistence.flush()).to.deep.equal({ ok: false, error: 'Network unavailable' });
    expect(persistence.hasPending).to.be.true;
  });

  it('flushes snapshots on disposal and rejects subsequent updates', async () => {
    persistence.schedule('Final');
    expect(await persistence.dispose()).to.deep.equal({ ok: true });
    expect(save.calledOnceWithExactly('Final')).to.be.true;
    await clock.tickAsync(1000);
    expect(save.calledOnce).to.be.true;
    expect(() => persistence.schedule('Too late')).to.throw('disposed');
  });
});
