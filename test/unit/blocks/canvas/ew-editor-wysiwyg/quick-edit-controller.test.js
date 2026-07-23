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
    send(createControllerOnMessage(ctx), { type: 'node-update', node: {}, cursorOffset: 0 });
    expect(ctx._spies.nodeFromJSON.called).to.be.false;
  });

  it('applies node-update messages for users with write access', () => {
    const ctx = makeCtx(true);
    send(createControllerOnMessage(ctx), { type: 'node-update', node: {}, cursorOffset: 0 });
    expect(ctx._spies.nodeFromJSON.called).to.be.true;
  });

  it('still processes non-mutating messages when read-only', () => {
    const ctx = makeCtx(false);
    // cursor-move with no offsets clears awareness — a read-only-safe, view-only op.
    send(createControllerOnMessage(ctx), { type: 'cursor-move' });
    expect(ctx._spies.setLocalStateField.calledWith('cursor', null)).to.be.true;
  });
});
