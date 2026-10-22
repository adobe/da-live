import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../../setup-nx.js';
import { parseSubdomain, setRecentSite, hasOrgAdminGrant } from '../../../../../blocks/browse/da-sites/utils.js';

describe('shared site-list helpers', () => {
  afterEach(() => {
    localStorage.removeItem('da-sites');
    sinon.restore();
  });

  it('reuses supported AEM and Helix site URLs', () => {
    ['aem.page', 'aem.live', 'hlx.page', 'hlx.live'].forEach((domain) => {
      expect(parseSubdomain(`https://main--my-site--my-org.${domain}/page?x=1`)).to.equal('#/my-org/my-site');
    });
  });

  it('rejects malformed, unrelated and credential-bearing URLs', () => {
    [
      'not a URL', 'https://example.com', 'https://main--site.aem.live',
      'https://main--site--org.fakeaem.live', 'https://main--site--org.aem.live.evil.com',
      'https://user:password@main--site--org.aem.live', 'ftp://main--site--org.aem.live',
      'https://main--site--org--extra.aem.live',
    ].forEach((href) => expect(parseSubdomain(href), href).to.equal(null));
  });

  it('keeps the existing browser-local ordering, deduplication and eight-site limit', () => {
    const sites = Array.from({ length: 8 }, (_, i) => `org/site-${i}`);
    localStorage.setItem('da-sites', JSON.stringify(sites));
    setRecentSite({ org: 'org', site: 'site-3' });
    expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal([
      'org/site-3', ...sites.filter((value) => value !== 'org/site-3'),
    ]);
    setRecentSite({ org: 'new', site: 'site' });
    expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal([
      'new/site', 'org/site-3', 'org/site-0', 'org/site-1', 'org/site-2', 'org/site-4', 'org/site-5', 'org/site-6',
    ]);
    const write = sinon.spy(Storage.prototype, 'setItem');
    setRecentSite({ org: 'new', site: 'site' });
    expect(write.called).to.equal(false);
  });

  it('reports malformed recent-site storage instead of silently replacing it', () => {
    localStorage.setItem('da-sites', '{}');
    expect(() => setRecentSite({ org: 'org', site: 'site' })).to.throw('Recent sites must be a list');
    expect(localStorage.getItem('da-sites')).to.equal('{}');
  });

  it('requires an explicit org-config write grant, not inferred or content permissions', () => {
    const response = (actions, status = 200) => new Response(null, { status, headers: actions ? { 'x-da-actions': actions } : {} });
    expect(hasOrgAdminGrant(response('/=read,write'))).to.equal(true);
    expect(hasOrgAdminGrant(response('/=read'))).to.equal(false);
    expect(hasOrgAdminGrant(response('/=read,write', 403))).to.equal(false);
    expect(hasOrgAdminGrant(response('/=read,write', 404))).to.equal(false);
    const fallback = response();
    fallback.permissions = ['read', 'write'];
    expect(hasOrgAdminGrant(fallback)).to.equal(false);
    const child = response('/=read');
    child.headers.set('x-da-child-actions', '/**=read,write');
    expect(hasOrgAdminGrant(child)).to.equal(false);
  });
});
