import { expect } from '@esm-bundle/chai';
import { getCreateSiteHref } from '../../../../blocks/shared/site-selector.js';

describe('site selector host routing', () => {
  it('preserves preview parameters but removes the old site and Browse route from creation', () => {
    const url = new URL(getCreateSiteHref({ org: 'org', href: 'https://sites--da-live--adobe.aem.live/?browse=2&nx=pickmenu&site=old#/org/site' }));
    expect(url.pathname).to.equal('/start');
    expect(url.searchParams.get('nx')).to.equal('pickmenu');
    expect(url.searchParams.get('org')).to.equal('org');
    expect(url.searchParams.has('site')).to.be.false;
    expect(url.searchParams.has('browse')).to.be.false;
    expect(url.hash).to.equal('');
  });

  it('derives the Create destination from the current host unless one is supplied', () => {
    const url = new URL(getCreateSiteHref({ org: 'example' }));
    expect(url.origin).to.equal(window.location.origin);
    expect(url.pathname).to.equal('/start');
    expect(url.searchParams.get('org')).to.equal('example');
    expect(url.hash).to.equal('');
  });
});
