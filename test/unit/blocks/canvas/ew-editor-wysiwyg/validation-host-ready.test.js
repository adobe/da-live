import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { canvasBus } = await import('../../../../../blocks/canvas/utils/canvas-bus.js');
await import('../../../../../blocks/canvas/ew-editor-wysiwyg/ew-editor-wysiwyg.js');

describe('ew-editor-wysiwyg validationHostReady', () => {
  it('emits true on connect and false on disconnect', () => {
    const values = [];
    const unsub = canvasBus.validationHostReady.subscribe((v) => values.push(v));

    const el = document.createElement('ew-editor-wysiwyg');
    document.body.appendChild(el);
    el.remove();

    unsub();
    expect(values).to.deep.equal([true, false]);
  });
});

describe('ew-editor-wysiwyg _runValidation', () => {
  it('emits a "nothing registered" result when the quick-edit port is not ready yet', () => {
    const el = document.createElement('ew-editor-wysiwyg');
    document.body.appendChild(el);

    let received;
    const unsub = canvasBus.validationResultState.subscribe((detail) => { received = detail; });
    el._runValidation();
    unsub();

    expect(received).to.deep.equal({ items: [], hasCustomValidation: false });
    el.remove();
  });
});
