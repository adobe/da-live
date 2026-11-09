import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx } from '../../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { setPreviewReadOnly } = await import('../../../../../../blocks/canvas/ew-editor-doc/utils/quick-edit-host.js');

describe('setPreviewReadOnly', () => {
  const makeCtx = () => ({ previewReadOnly: false, port: { postMessage: sinon.spy() } });

  it('locks and unlocks the preview over the port', () => {
    const ctx = makeCtx();
    setPreviewReadOnly(ctx, true);
    setPreviewReadOnly(ctx, false);
    expect(ctx.port.postMessage.args.map(([m]) => m)).to.deep.equal([
      { type: 'set-read-only', payload: { readOnly: true } },
      { type: 'set-read-only', payload: { readOnly: false } },
    ]);
    expect(ctx.previewReadOnly).to.equal(false);
  });

  it('only posts when the state changes', () => {
    const ctx = makeCtx();
    setPreviewReadOnly(ctx, false);
    setPreviewReadOnly(ctx, true);
    setPreviewReadOnly(ctx, true);
    expect(ctx.port.postMessage.callCount).to.equal(1);
  });

  it('does nothing without a controller port', () => {
    expect(() => setPreviewReadOnly(undefined, true)).to.not.throw();
    expect(() => setPreviewReadOnly({ previewReadOnly: false }, true)).to.not.throw();
  });
});
