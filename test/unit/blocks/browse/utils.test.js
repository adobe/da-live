import { expect } from '@esm-bundle/chai';
import { getBrowsePath } from '../../../../blocks/browse/utils.js';

describe('browse implementation selection', () => {
  it('defaults to legacy browse without an explicit opt-in', () => {
    ['', '?nx=local', '?browse=', '?browse=1', '?browse=02', '?browse=other'].forEach((search) => {
      expect(getBrowsePath({ search })).to.equal('./legacy');
    });
  });

  it('selects the redesign with browse=2 alongside existing query parameters', () => {
    ['?browse=2', '?nx=local&browse=2', '?browse=2&da-admin=stage'].forEach((search) => {
      expect(getBrowsePath({ search })).to.equal('./v2');
    });
  });
});
