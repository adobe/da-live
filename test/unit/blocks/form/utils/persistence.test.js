import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import { attachPersistence } from '../../../../../blocks/form/utils/persistence.js';
import { createEngine } from '../../../../../deps/da-sc-sdk/dist/index.js';

// Minimal editor stub. `setValues(next, model)` simulates a real mutation by
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
    setValues: (next, model) => {
      state = {
        document: {
          metadata: { schemaName: 'demo' },
          data: next,
        },
        model,
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

  const IMAGE_URL = 'https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas/image/v1.0.0.json';
  const assetSchema = {
    type: 'object',
    properties: { hero: { $ref: IMAGE_URL }, logo: { $ref: IMAGE_URL } },
  };
  // The model the engine builds for `data`, as the editor state carries it.
  const modelFor = (data) => createEngine({
    schema: assetSchema,
    document: { metadata: { schemaName: 'demo' }, data },
  }).getState().model;

  it('writes asset fields as images from the model in the editor state', async () => {
    const hero = 'https://content.da.live/org/site/hero.png';
    const data = { hero: { src: hero, altText: 'A hero' } };
    const editor = makeEditor();
    const { save, calls, release } = makeSave();
    const p = attachPersistence(editor, { path: '/x', save });

    editor.setValues(data);
    p.notify();
    await tick();
    expect(calls[0].html).to.not.include('<img');
    release();
    await tick();

    editor.setValues({ ...data }, modelFor(data));
    p.notify();
    await tick();
    expect(calls[1].html).to.include(`<img src="${hero}" alt="A hero">`);
    p.detach();
  });

  it('reads the config on every save to write images from other hosts as links', async () => {
    const aem = 'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:1/as/hero.avif';
    const upload = 'https://content.da.live/org/site/hero.png';
    const data = { hero: { src: aem }, logo: { src: upload } };
    const editor = makeEditor();
    const { save, calls, release } = makeSave();
    let asLinks = false;
    const getConfig = () => ({ externalImagesAsLinks: asLinks });
    const p = attachPersistence(editor, { path: '/x', save, getConfig });

    editor.setValues(data, modelFor(data));
    p.notify();
    await tick();
    expect(calls[0].html).to.include(`<img src="${aem}" alt="">`);
    release();
    await tick();

    asLinks = true;
    editor.setValues({ ...data }, modelFor(data));
    p.notify();
    await tick();
    expect(calls[1].html).to.include(`<a href="${aem}">${aem}</a>`);
    expect(calls[1].html).to.include(`<img src="${upload}" alt="">`);
    p.detach();
  });
});
