import { expect } from '@esm-bundle/chai';

// This is needed to make a dynamic import work that is indirectly referenced
// from da-editor.js
const { setNx } = await import('../../../../../scripts/utils.js');
setNx('/bheuaark/', { hostname: 'localhost' });

const { default: DaContent } = await import('../../../../../blocks/edit/da-content/da-content.js');

describe('da-content', () => {
  it('Test wsprovider disconnectedcallback', async () => {
    const ed = new DaContent();

    const called = [];
    const mockWSProvider = { disconnect: () => called.push('disconnect') };

    ed.wsProvider = mockWSProvider;
    ed.disconnectWebsocket();
    expect(ed.wsProvider).to.be.undefined;
    expect(called).to.deep.equal(['disconnect']);
  });
});
