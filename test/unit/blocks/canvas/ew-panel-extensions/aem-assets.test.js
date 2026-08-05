import { expect } from '@esm-bundle/chai';

const { setNx, getNx } = await import('../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

// Import the fixture via the same `${getNx()}` specifier aem-assets.js uses so both
// resolve to the same module instance (the dev server keys the two forms separately).
const { __setDaConfigs } = await import(`${getNx()}/utils/daConfig.js`);
const { getRepositoryConfig, resolveAssetUrl, buildHandleSelection } = await import(
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

// ---------------------------------------------------------------------------
// buildHandleSelection
// ---------------------------------------------------------------------------

// Minimal ProseMirror view with a tracked dispatch spy (mirrors the edit-side test).
function makeView() {
  const dispatched = [];
  const schema = { nodes: { image: { create: (attrs) => ({ type: 'image', attrs }) } } };
  const tr = {
    replaceSelectionWith: () => tr,
    insert: () => tr,
    deleteSelection: () => tr,
    scrollIntoView: () => tr,
  };
  return {
    dispatched,
    state: { schema, selection: { $from: { depth: 0, node: () => null }, from: 0 }, tr },
    dispatch: (t) => dispatched.push(t),
  };
}

function makePanel() {
  const el = document.createElement('div');
  el.style.display = 'block';
  return el;
}

describe('canvas buildHandleSelection', () => {
  let orgFetch;
  beforeEach(() => { orgFetch = window.fetch; });
  afterEach(() => { window.fetch = orgFetch; });

  const PLAIN_CONFIG = {
    tierType: 'author',
    assetOrigin: 'publish-p1-e1.adobeaemcloud.com',
    assetBasePath: '/adobe/assets',
    isDmEnabled: false,
    isSmartCrop: false,
  };
  const SMARTCROP_CONFIG = {
    tierType: 'author',
    assetOrigin: 'delivery-p1-e1.adobeaemcloud.com',
    assetBasePath: '/adobe/assets',
    isDmEnabled: true,
    isSmartCrop: true,
  };
  const IMAGE_ASSET = { mimetype: 'image/jpeg', name: 'photo.jpg', path: '/content/dam/photo.jpg', 'repo:id': 'urn:aaid:aem:img-001' };
  const PDF_ASSET = { mimetype: 'application/pdf', name: 'doc.pdf', path: '/content/dam/doc.pdf', 'repo:id': 'urn:aaid:aem:pdf-001' };

  function setup(repoConfig = PLAIN_CONFIG) {
    const view = makeView();
    const assetPanel = makePanel();
    const secondaryPanel = makePanel();
    let closed = 0;
    const handler = buildHandleSelection({
      repoConfig,
      assetPanel,
      secondaryPanel,
      responsiveImageConfigPromise: Promise.resolve(false),
      getView: () => view,
      onClose: () => { closed += 1; },
    });
    return { view, assetPanel, secondaryPanel, handler, closed: () => closed };
  }

  it('does nothing when the assets array is empty', async () => {
    const { view, handler, closed } = setup();
    await handler([]);
    expect(view.dispatched).to.have.length(0);
    expect(closed()).to.equal(0);
  });

  it('does nothing when there is no active view', async () => {
    let closed = 0;
    const handler = buildHandleSelection({
      repoConfig: PLAIN_CONFIG,
      assetPanel: makePanel(),
      secondaryPanel: makePanel(),
      responsiveImageConfigPromise: Promise.resolve(false),
      getView: () => null,
      onClose: () => { closed += 1; },
    });
    await handler([IMAGE_ASSET]);
    expect(closed).to.equal(0);
  });

  it('inserts an image and closes for a standard (non-smart-crop) image', async () => {
    const { view, handler, closed } = setup(PLAIN_CONFIG);
    await handler([IMAGE_ASSET]);
    expect(view.dispatched).to.have.length(1);
    expect(closed()).to.equal(1);
  });

  it('takes the link path (not image) for non-image assets', async () => {
    const { view, handler, closed } = setup(PLAIN_CONFIG);
    // insertLink needs a real schema to parse; catch and assert we branched to link.
    try { await handler([PDF_ASSET]); } catch { /* proseDOMParser mock limitation */ }
    expect(view.dispatched).to.have.length(0);
    expect(closed()).to.equal(1);
  });

  it('opens the smart-crop picker for an image when crops are available', async () => {
    window.fetch = async () => ({
      ok: true,
      json: async () => ({ items: [{ name: 'desktop' }, { name: 'mobile' }] }),
    });
    const { secondaryPanel, assetPanel, handler } = setup(SMARTCROP_CONFIG);
    await handler([IMAGE_ASSET]);
    expect(assetPanel.style.display).to.equal('none');
    expect(secondaryPanel.style.display).to.equal('block');
    expect(secondaryPanel.querySelector('.da-dialog-asset-crops')).to.exist;
  });

  it('inserts the image directly when smart crop is on but no crops exist', async () => {
    window.fetch = async () => ({ ok: true, json: async () => ({ items: [] }) });
    const { view, handler, closed } = setup(SMARTCROP_CONFIG);
    await handler([IMAGE_ASSET]);
    expect(view.dispatched).to.have.length(1);
    expect(closed()).to.equal(1);
  });
});
