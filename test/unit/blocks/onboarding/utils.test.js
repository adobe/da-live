import { expect } from '@esm-bundle/chai';

const { setNx, getNx2 } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { parseSubdomain } = await import(`${getNx2()}/blocks/siteselector/site-utils.js`);
const { getSiteFromUrl } = await import('../../../../blocks/onboarding/utils.js');

describe('onboarding/utils getSiteFromUrl', () => {
  afterEach(() => parseSubdomain.reset());

  it('reads the org and site from a GitHub repository URL', () => {
    expect(getSiteFromUrl('https://github.com/adobe/geometrixx')).to.deep.equal({ org: 'adobe', site: 'geometrixx' });
    expect(parseSubdomain.called).to.be.false;
  });

  it('reads the org and site from an AEM site URL', () => {
    parseSubdomain.withArgs('https://main--geometrixx--adobe.aem.page').returns('#/adobe/geometrixx');
    expect(getSiteFromUrl('https://main--geometrixx--adobe.aem.page')).to.deep.equal({ org: 'adobe', site: 'geometrixx' });
  });

  it('returns undefined for other URLs', () => {
    parseSubdomain.returns(null);
    expect(getSiteFromUrl('https://github.com/adobe')).to.be.undefined;
    expect(getSiteFromUrl('https://example.com/adobe/geometrixx')).to.be.undefined;
  });
});
