import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import { attachPersistence } from '../../../../../blocks/form/utils/persistence.js';

// Minimal editor stub. `setValues(next)` simulates a real mutation by
// replacing `state.document` with a NEW reference — persistence uses
// reference equality on the document to detect mutations.
function makeEditor(initial = {}) {
  let state = {
    document: {
      metadata: { schemaName: 'demo' },
      data: initial,
    },
  };
  return {
    getState: () => state,
    setValues: (next) => {
      state = {
        document: {
          metadata: { schemaName: 'demo' },
          data: next,
        },
      };
    },
  };
}

// A controllable save stub. Returns a Promise that resolves only when the
// test calls `release(callIndex)`. Tracks every (path, html) call.
function makeSave() {
  const calls = [];
  const resolvers = [];
  const save = ({ path, html }) => new Promise((resolve, reject) => {
    calls.push({ path, html });
    resolvers.push({ resolve, reject });
  });
  return {
    save,
    calls,
    release: (i = calls.length - 1) => resolvers[i].resolve(),
    fail: (i = calls.length - 1, err = new Error('boom')) => resolvers[i].reject(err),
    settledCount: () => resolvers.length,
  };
}

const tick = () => new Promise((r) => { setTimeout(r, 0); });

describe('attachPersistence', () => {
  it('does not save when notify() is called with no mutation (same values reference)', async () => {
    const editor = makeEditor();
    const { save, calls } = makeSave();
    const p = attachPersistence(editor, { path: '/x', save });

    p.notify();
    p.notify();
    await tick();
    expect(calls).to.have.lengthOf(0);
    p.detach();
  });

  it('saves once after a mutation', async () => {
    const editor = makeEditor();
    const { save, calls, release } = makeSave();
    const p = attachPersistence(editor, { path: '/x', save });

    editor.setValues({ a: 1 });
    p.notify();
    await tick();
    expect(calls).to.have.lengthOf(1);
    expect(calls[0].path).to.equal('/x');
    expect(calls[0].html).to.include('demo');
    release();
    p.detach();
  });

  it('coalesces concurrent mutations during an in-flight save (single-flight + re-queue)', async () => {
    // Critical contract: mid-flight notifies don't fire concurrent saves;
    // they set `pending` so a SECOND save runs after the first settles, with
    // the LATEST values. Prevents out-of-order overwrites on slow networks.
    const editor = makeEditor();
    const { save, calls, release } = makeSave();
    const p = attachPersistence(editor, { path: '/x', save });

    editor.setValues({ a: 1 });
    p.notify(); // → save #1 starts (call 0)
    await tick();
    expect(calls).to.have.lengthOf(1);

    editor.setValues({ a: 2 });
    p.notify(); // mid-flight: should NOT start save #2 yet
    editor.setValues({ a: 3 });
    p.notify(); // still mid-flight: still pending
    await tick();
    expect(calls).to.have.lengthOf(1); // still one — no concurrent save

    release(0); // save #1 settles
    await tick();
    // After settle, the loop re-iterates because pending is true. The
    // second save reads the LATEST state — should serialize a:3, not a:2.
    expect(calls).to.have.lengthOf(2);
    expect(calls[1].html).to.include('>3<'); // latest value present
    expect(calls[1].html).to.not.include('>2<'); // intermediate never serialized
    release(1);
    await tick();

    // No further saves — pending was cleared at the second iteration.
    editor.setValues({ a: 4 });
    p.notify();
    await tick();
    expect(calls).to.have.lengthOf(3); // third save fires fresh
    release(2);
    p.detach();
  });

  it('detach() prevents subsequent saves', async () => {
    const editor = makeEditor();
    const { save, calls } = makeSave();
    const p = attachPersistence(editor, { path: '/x', save });

    p.detach();
    editor.setValues({ a: 1 });
    p.notify();
    await tick();
    expect(calls).to.have.lengthOf(0);
  });

  it('detach() mid-flight lets the current save settle without crashing', async () => {
    const editor = makeEditor();
    const { save, calls, release } = makeSave();
    const p = attachPersistence(editor, { path: '/x', save });

    editor.setValues({ a: 1 });
    p.notify();
    await tick();
    expect(calls).to.have.lengthOf(1);

    p.detach(); // detach while save in flight
    editor.setValues({ a: 2 });
    p.notify(); // ignored — detached
    release(0);
    await tick();
    // Only the in-flight save settles; no re-iteration because the detached
    // notify never set `pending`.
    expect(calls).to.have.lengthOf(1);
  });

  it('does not crash when save throws — and stops the loop instead of retrying forever', async () => {
    const editor = makeEditor();
    const { save, calls, fail } = makeSave();
    const p = attachPersistence(editor, { path: '/x', save });

    editor.setValues({ a: 1 });
    p.notify();
    await tick();
    expect(calls).to.have.lengthOf(1);

    fail(0);
    await tick();
    // No retry — persistence intentionally swallows the error. Caller's next
    // mutation triggers a fresh save attempt.
    expect(calls).to.have.lengthOf(1);

    editor.setValues({ a: 2 });
    p.notify();
    await tick();
    expect(calls).to.have.lengthOf(2);
    p.detach();
  });

  it('skips the save when convertJsonToHtml returns an error (no schemaName)', async () => {
    // Document with no schemaName fails the SDK's convertJsonToHtml validation.
    // Persistence must NOT try to save — and must not loop forever waiting
    // for a fix. (`pending` is cleared even when convertJsonToHtml errors.)
    const editor = {
      _state: { document: { metadata: {}, data: { a: 1 } } },
      getState() { return this._state; },
      mutate(next) {
        this._state = { document: { metadata: {}, data: next } };
      },
    };
    const { save, calls } = makeSave();
    const p = attachPersistence(editor, { path: '/x', save });

    editor.mutate({ a: 2 });
    p.notify();
    await tick();
    expect(calls).to.have.lengthOf(0);

    // Mutating to a valid doc should now save normally.
    editor._state = { document: { metadata: { schemaName: 'demo' }, data: { a: 3 } } };
    p.notify();
    await tick();
    expect(calls).to.have.lengthOf(1);
    p.detach();
  });
});
