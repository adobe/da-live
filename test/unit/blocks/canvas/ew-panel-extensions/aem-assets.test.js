import { expect } from '@esm-bundle/chai';

const { setNx, getNx } = await import('../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

// Import the fixture via the same `${getNx()}` specifier aem-assets.js uses so both
// resolve to the same module instance (the dev server keys the two forms separately).
const { __setDaConfigs } = await import(`${getNx()}/utils/daConfig.js`);
const { getRepositoryConfig, resolveAssetUrl } = await import(
  '../../../../../blocks/canvas/ew-panel-extensions/aem-assets.js'
);

function sheet(entries) {
  return { data: Object.entries(entries).map(([key, value]) => ({ key, value })) };
}

afterEach(() => __setDaConfigs([]));

// ---------------------------------------------------------------------------
// getRepositoryConfig
// ---------------------------------------------------------------------------

describe('canvas getRepositoryConfig', () => {
  it('returns null when repositoryId is missing', async () => {
    __setDaConfigs([sheet({ 'aem.assets.prod.origin': 'delivery-x.example.com' })]);
    expect(await getRepositoryConfig('o', 's')).to.equal(null);
  });

  it('exposes isSmartCrop=true when aem.asset.smartcrop.select is on', async () => {
    __setDaConfigs([sheet({
      'aem.repositoryId': 'author-p1-e1.adobeaemcloud.com',
      'aem.asset.smartcrop.select': 'on',
    })]);
    const config = await getRepositoryConfig('o', 's');
    expect(config.isSmartCrop).to.equal(true);
    // Smart crop implies DM delivery, so the origin flips author -> delivery.
    expect(config.isDmEnabled).to.equal(true);
    expect(config.assetOrigin).to.equal('delivery-p1-e1.adobeaemcloud.com');
  });

  it('exposes isSmartCrop=false when the flag is absent', async () => {
    __setDaConfigs([sheet({ 'aem.repositoryId': 'author-p1-e1.adobeaemcloud.com' })]);
    const config = await getRepositoryConfig('o', 's');
    expect(config.isSmartCrop).to.equal(false);
  });
});

// ---------------------------------------------------------------------------
// resolveAssetUrl
// ---------------------------------------------------------------------------

describe('canvas resolveAssetUrl', () => {
  const DELIVERY_CONFIG = {
    tierType: 'delivery',
    assetOrigin: 'delivery-p1-e1.adobeaemcloud.com',
    assetBasePath: '/adobe/assets',
    isDmEnabled: true,
  };
  const AUTHOR_DM_CONFIG = {
    tierType: 'author',
    assetOrigin: 'delivery-p1-e1.adobeaemcloud.com',
    assetBasePath: '/adobe/assets',
    isDmEnabled: true,
  };

  it('builds a delivery URL for delivery tier', () => {
    const asset = { 'repo:assetId': 'urn:aaid:aem:del-001', 'repo:name': 'photo.jpg' };
    expect(resolveAssetUrl(asset, DELIVERY_CONFIG)).to.equal(
      'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:del-001/as/photo.avif',
    );
  });

  it('builds a DM URL for author+DM tier (smart crop original)', () => {
    const asset = { 'repo:id': 'urn:aaid:aem:img-001', name: 'photo.jpg', mimetype: 'image/jpeg' };
    expect(resolveAssetUrl(asset, AUTHOR_DM_CONFIG)).to.equal(
      'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:img-001/as/photo.avif',
    );
  });
});
