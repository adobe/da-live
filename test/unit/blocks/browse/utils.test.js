import { expect } from '@esm-bundle/chai';
import { getBrowseComponent } from '../../../../blocks/browse/utils.js';

describe('Home landing toggle', () => {
  it('keeps existing Home unless landing is explicitly true', () => {
    ['', '?landing=false', '?landing=home', '?landing=', '?landing=TRUE'].forEach((search) => {
      expect(getBrowseComponent({ search })).to.equal('da-sites');
    });
  });

  it('opts Home into the landing surface alongside other parameters', () => {
    expect(getBrowseComponent({ search: '?nx=lpbg&landing=true' })).to.equal('da-landing');
  });

  it('never replaces site Browse with the landing surface', () => {
    ['', '?landing=true', '?landing=false'].forEach((search) => {
      expect(getBrowseComponent({ search, pathDetails: { org: 'example', site: 'site' } }))
        .to.equal('da-browse');
    });
  });
});
