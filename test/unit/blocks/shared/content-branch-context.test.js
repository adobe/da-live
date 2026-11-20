import { expect } from '@esm-bundle/chai';
import { parseSiteSegment, withBranch, getContentBranch } from '../../../../blocks/shared/content-branch-context.js';

describe('content branch URL context', () => {
  it('uses the bare site for default and preserves a valid branch', () => {
    expect(parseSiteSegment('my_site-1')).to.deep.equal({ site: 'my_site-1', branch: null });
    expect(parseSiteSegment('site~camp1234')).to.deep.equal({ site: 'site', branch: 'camp1234' });
    expect(withBranch('site', 'campaign')).to.equal('site~campaign');
    expect(withBranch('site')).to.equal('site');
    expect(Object.isFrozen(parseSiteSegment('site'))).to.be.true;
  });

  it('rejects explicit malformed or noncanonical suffixes instead of defaulting', () => {
    ['site~', 'site~main', 'site~ABC', 'site~toolong99', 'site~x~y', '~x', 'site%7Ex', 'site~a-b']
      .forEach((value) => expect(() => parseSiteSegment(value), value).to.throw(TypeError));
    expect(() => withBranch('site~x', 'y')).to.throw(TypeError);
    expect(() => withBranch('site', 'main')).to.throw(TypeError);
    expect(() => withBranch('site', '')).to.throw(TypeError);
  });

  it('reads the raw hash rather than sanitized path details', () => {
    expect(getContentBranch('#/org/site~branch/page')).to.equal('branch');
    expect(getContentBranch('#/org/site/page')).to.equal(null);
    expect(getContentBranch('#/org')).to.equal(null);
    expect(() => getContentBranch('#/org/site~/page')).to.throw(TypeError);
    const saved = window.location.hash;
    try {
      window.location.hash = '#/org/site~abc/page';
      expect(getContentBranch()).to.equal('abc');
    } finally { window.location.hash = saved; }
  });
});
