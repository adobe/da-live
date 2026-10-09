import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createControllerOnMessage } = await import('../../../../../blocks/canvas/ew-editor-wysiwyg/quick-edit-controller.js');

function makeCtx(canWrite) {
  const nodeFromJSON = sinon.spy();
  const setLocalStateField = sinon.spy();
  return {
    canWrite,
    path: '/page',
    wsProvider: { awareness: { setLocalStateField } },
    view: {
      state: {
        storedMarks: [],
        selection: { from: 0 },
        schema: { nodeFromJSON },
        doc: {
          content: { size: 10 },
          // Halts updateState right after the (spied) nodeFromJSON call so the test
          // only observes whether the handler was reached, not full PM behaviour.
          resolve: () => { throw new Error('stop'); },
        },
      },
      dispatch: sinon.spy(),
    },
    _spies: { nodeFromJSON, setLocalStateField },
  };
}

function send(onMessage, data) {
  try {
    onMessage({ data });
  } catch {
    // Fake PM state throws once the (allowed) handler proceeds — irrelevant here.
  }
}

describe('quick-edit-controller message gate', () => {
  it('drops mutating node-update messages for read-only users', () => {
    const ctx = makeCtx(false);
    send(createControllerOnMessage(ctx), { type: 'node-update', payload: { node: {}, cursorOffset: 0 } });
    expect(ctx._spies.nodeFromJSON.called).to.be.false;
  });

  it('applies node-update messages for users with write access', () => {
    const ctx = makeCtx(true);
    const node = { type: 'paragraph' };
    send(createControllerOnMessage(ctx), { type: 'node-update', payload: { node, cursorOffset: 0 } });
    expect(ctx._spies.nodeFromJSON.calledWith(node)).to.be.true;
  });

  it('still processes non-mutating messages when read-only', () => {
    const ctx = makeCtx(false);
    // cursor-move with no offsets clears awareness — a read-only-safe, view-only op.
    send(createControllerOnMessage(ctx), { type: 'cursor-move' });
    expect(ctx._spies.setLocalStateField.calledWith('cursor', null)).to.be.true;
  });
});

describe('quick-edit-controller RELOAD coalescing', () => {
  let clock;

  beforeEach(() => { clock = sinon.useFakeTimers(); });
  afterEach(() => { clock.restore(); });

  // updateDocument reads the document identity and the empty view DOM before
  // posting SET_BODY; the spy records each reload.
  function makeReloadCtx() {
    return {
      canWrite: true,
      suppressRerender: false,
      view: { dom: document.createElement('div'), state: { doc: {} } },
      port: { postMessage: sinon.spy() },
    };
  }

  const setBodyCount = (ctx) => ctx.port.postMessage.getCalls()
    .filter((c) => c.args[0]?.type === 'set-body').length;

  it('coalesces a burst of RELOADs into a single updateDocument', () => {
    const ctx = makeReloadCtx();
    const onMessage = createControllerOnMessage(ctx);
    for (let i = 0; i < 5; i += 1) send(onMessage, { type: 'reload' });
    // Still inside the debounce window — nothing has fired yet.
    expect(setBodyCount(ctx)).to.equal(0);
    clock.tick(200);
    expect(setBodyCount(ctx)).to.equal(1);
  });

  it('runs updateDocument again for a RELOAD after the window elapses', () => {
    const ctx = makeReloadCtx();
    const onMessage = createControllerOnMessage(ctx);
    send(onMessage, { type: 'reload' });
    clock.tick(200);
    send(onMessage, { type: 'reload' });
    clock.tick(200);
    expect(setBodyCount(ctx)).to.equal(2);
  });
});

describe('quick-edit-controller QUICK_EDIT_IFRAME_CLICK forwarding', () => {
  let prevHlx;

  beforeEach(() => { prevHlx = window.hlx; });
  afterEach(() => { window.hlx = prevHlx; });

  it('records a layout RUM click from a forwarded iframe click without a source', () => {
    const sampleRUM = sinon.spy();
    window.hlx = { rum: { sampleRUM } };
    const ctx = makeCtx(true);
    send(createControllerOnMessage(ctx), {
      type: 'quick-edit-iframe-click',
      payload: { target: 'hero' },
    });
    expect(sampleRUM.calledOnceWith('click', { source: 'ew-wysiwyg-layout', target: 'hero' })).to.be.true;
  });

  it('records an ew-wysiwyg-layout RUM click when the iframe reports the layout source', () => {
    const sampleRUM = sinon.spy();
    window.hlx = { rum: { sampleRUM } };
    const ctx = makeCtx(true);
    send(createControllerOnMessage(ctx), {
      type: 'quick-edit-iframe-click',
      payload: { target: 'hero', source: 'ew-wysiwyg-layout' },
    });
    expect(sampleRUM.calledOnceWith('click', { source: 'ew-wysiwyg-layout', target: 'hero' })).to.be.true;
  });

  ['ew-wysiwyg-doc', 'ew-editor-doc', 'something-else'].forEach((source) => {
    it(`attributes iframe clicks to layout regardless of the reported source: ${source}`, () => {
      const sampleRUM = sinon.spy();
      window.hlx = { rum: { sampleRUM } };
      const ctx = makeCtx(true);
      send(createControllerOnMessage(ctx), {
        type: 'quick-edit-iframe-click',
        payload: { target: 'a', source },
      });
      expect(sampleRUM.calledOnceWith('click', {
        source: 'ew-wysiwyg-layout',
        target: 'a',
      })).to.be.true;
    });
  });

  it('still attributes the source when the iframe sends no target', () => {
    const sampleRUM = sinon.spy();
    window.hlx = { rum: { sampleRUM } };
    const ctx = makeCtx(true);
    send(createControllerOnMessage(ctx), { type: 'quick-edit-iframe-click', payload: {} });
    expect(sampleRUM.calledOnceWith('click', { source: 'ew-wysiwyg-layout', target: undefined })).to.be.true;
  });

  ['rum-click', 'iframe-click'].forEach((type) => {
    it(`ignores the superseded ${type} type`, () => {
      const sampleRUM = sinon.spy();
      window.hlx = { rum: { sampleRUM } };
      const ctx = makeCtx(true);
      send(createControllerOnMessage(ctx), { type, payload: { target: 'p' } });
      expect(sampleRUM.called).to.be.false;
    });
  });

  it('does not throw when RUM is not initialised on the page', () => {
    window.hlx = undefined;
    const ctx = makeCtx(true);
    const onMessage = createControllerOnMessage(ctx);
    expect(() => onMessage({ data: { type: 'quick-edit-iframe-click', payload: { target: 'p' } } }))
      .to.not.throw();
  });
});
