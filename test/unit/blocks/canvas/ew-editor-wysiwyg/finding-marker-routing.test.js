import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createControllerOnMessage } = await import('../../../../../blocks/canvas/ew-editor-wysiwyg/quick-edit-controller.js');

describe('quick-edit controller finding messages', () => {
  it('routes marker click and layout to ctx.findings (even without write access)', () => {
    const calls = [];
    const ctx = {
      canWrite: false,
      findings: {
        onMarkerClick: (p) => calls.push(['click', p]),
        onMarkerLayout: (p) => calls.push(['layout', p]),
      },
    };
    const onMessage = createControllerOnMessage(ctx);
    onMessage({ data: { type: 'finding-marker-click', payload: { id: 'text:4' } } });
    onMessage({
      data: {
        type: 'finding-marker-layout',
        payload: { id: 'text:4', rect: { top: 1, left: 2, width: 3, height: 4 } },
      },
    });
    expect(calls).to.deep.equal([
      ['click', { id: 'text:4' }],
      ['layout', { id: 'text:4', rect: { top: 1, left: 2, width: 3, height: 4 } }],
    ]);
  });

  it('ignores finding messages when no findings controller is attached', () => {
    const onMessage = createControllerOnMessage({ canWrite: true });
    expect(() => onMessage({ data: { type: 'finding-marker-click', payload: { id: 'x' } } })).to.not.throw();
  });
});
