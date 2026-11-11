import { expect } from '@esm-bundle/chai';
import { getBrowseComponent, resolveBrowsePath } from '../../../../blocks/browse/utils.js';

describe('Home landing toggle', () => {
  it('keeps existing Home unless landing is explicitly true', () => {
    ['', '?landing=false', '?landing=home', '?landing=', '?landing=TRUE'].forEach((search) => {
      expect(getBrowseComponent({ search })).to.equal('da-sites');
    });
  });

  it('opts Home into the landing surface alongside other parameters', () => {
    expect(getBrowseComponent({ search: '?nx=lpbg&landing=true' })).to.equal('da-landing');
  });

  it('opts Home into the landing surface when the page authors a Landing table, unless landing=false', () => {
    expect(getBrowseComponent({ search: '', hasLanding: true })).to.equal('da-landing');
    expect(getBrowseComponent({ search: '?landing=false', hasLanding: true })).to.equal('da-sites');
    expect(getBrowseComponent({ search: '', hasLanding: true, pathDetails: { org: 'o', site: 's' } }))
      .to.equal('da-browse');
  });

  it('never replaces site Browse with the landing surface', () => {
    ['', '?landing=true', '?landing=false'].forEach((search) => {
      expect(getBrowseComponent({ search, pathDetails: { org: 'example', site: 'site' } }))
        .to.equal('da-browse');
    });
  });
});

describe('browse implementation selection', () => {
  it('defaults to v2 without an explicit legacy opt-out', () => {
    const searches = ['', '?nx=local', '?browse=', '?browse=01', '?browse=02', '?browse=other'];
    searches.forEach((search) => {
      expect(resolveBrowsePath({ search })).to.equal('./v2');
    });
  });

  it('continues to support browse=2 alongside existing query parameters', () => {
    const searches = ['?browse=2', '?nx=local&browse=2', '?browse=2&da-admin=stage'];
    searches.forEach((search) => {
      expect(resolveBrowsePath({ search })).to.equal('./v2');
    });
  });

  it('selects legacy only with browse=1 alongside existing query parameters', () => {
    const searches = ['?browse=1', '?nx=local&browse=1', '?browse=1&da-admin=stage'];
    searches.forEach((search) => {
      expect(resolveBrowsePath({ search })).to.equal('./legacy');
    });
  });
});
