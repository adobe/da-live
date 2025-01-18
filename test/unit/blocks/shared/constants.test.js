import { expect } from '@esm-bundle/chai';
import { getDaAdmin, COLLAB_ORIGIN } from '../../../../blocks/shared/constants.js';

import '../../milo.js';

describe('DA Admin', () => {
  it('Sets DA admin default', () => {
    const env = getDaAdmin();
    expect(env).to.equal('https://da.live/api');
  });

  it('Sets DA admin stage', () => {
    const env = getDaAdmin({ href: 'http://localhost:3000/?da-admin=stage' });
    expect(env).to.equal('https://stage-admin.da.live');
  });

  it('Gets cached DA admin stage', () => {
    const env = getDaAdmin();
    expect(env).to.equal('https://stage-admin.da.live');
  });

  it('Resets DA admin', () => {
    const env = getDaAdmin({ href: 'http://localhost:3000/?da-admin=reset' });
    expect(env).to.equal('https://da.live/api');
  });
});

describe('DA Collab', () => {
  it('Gets DA Collab default', () => {
    expect(COLLAB_ORIGIN).to.equal('wss://collab.da.live');
  });
});
