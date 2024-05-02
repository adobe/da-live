import { expect } from '@esm-bundle/chai';

// This is needed to make a dynamic import work that is indirectly referenced
// from edit/prose/index.js
const { setNx } = await import('../../../../scripts/utils.js');
setNx('/bheuaark/', { hostname: 'localhost' });

const pi = await import('../../../../blocks/edit/prose/index.js');

describe('Prose collab', () => {
  it('Test awareness status', () => {
    const schema = pi.getSchema();
    expect(schema).to.be.null;
  });
});
