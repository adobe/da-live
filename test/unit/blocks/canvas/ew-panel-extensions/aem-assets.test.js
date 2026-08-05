import { expect } from '@esm-bundle/chai';

const { setNx, getNx } = await import('../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

// Import the fixture via the same `${getNx()}` specifier aem-assets.js uses so both
// resolve to the same module instance (the dev server keys the two forms separately).
const { __setDaConfigs } = await import(`${getNx()}/utils/daConfig.js`);
const { getRepositoryConfig } = await import(
  '../../../../../blocks/canvas/ew-panel-extensions/aem-assets.js'
);

function sheet(entries) {
  return { data: Object.entries(entries).map(([key, value]) => ({ key, value })) };
}

afterEach(() => __setDaConfigs([]));

// ---------------------------------------------------------------------------
// getRepositoryConfig
//
// The selection/insertion logic (buildHandleSelection, resolveAssetUrl, getAssetAlt) is
// shared with the classic editor and covered by test/unit/blocks/edit/da-assets. The only
// canvas-specific piece is this config resolver.
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

  it('tolerates per-config fetch errors (nx daConfig shape)', async () => {
    __setDaConfigs([
      { error: 'boom' },
      sheet({ 'aem.repositoryId': 'delivery-p1-e1.adobeaemcloud.com' }),
    ]);
    const config = await getRepositoryConfig('o', 's');
    expect(config.tierType).to.equal('delivery');
    expect(config.assetOrigin).to.equal('delivery-p1-e1.adobeaemcloud.com');
  });
});
