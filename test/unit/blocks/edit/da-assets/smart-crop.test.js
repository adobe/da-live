import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../../scripts/utils.js');
setNx('/bheuaark/', { hostname: 'localhost' });

const { showSmartCropDialog } = await import('../../../../../blocks/edit/da-assets/helpers/smart-crop.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ASSET = {
  name: 'mountain.jpg',
  mimetype: 'image/jpeg',
  'repo:id': 'urn:aaid:aem:abc-123',
};

const DM_ORIGIN = 'delivery-p1-e1.adobeaemcloud.com';
const ASSET_URL = 'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:abc-123/as/mountain.jpg';

const SMART_CROPS = {
  items: [
    { name: 'desktop' },
    { name: 'mobile' },
  ],
};

function mockFetchWithCrops(crops = SMART_CROPS) {
  return async () => ({ ok: true, json: async () => crops });
}

function makeContainer() {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
}

function cleanup(el) {
  el.remove();
}

// ---------------------------------------------------------------------------
// Returns false when no smart crops
// ---------------------------------------------------------------------------

describe('showSmartCropDialog — no crops', () => {
  it('returns false when items array is empty', async () => {
    const orgFetch = window.fetch;
    window.fetch = mockFetchWithCrops({ items: [] });
    const container = makeContainer();
    try {
      const result = await showSmartCropDialog({
        container,
        asset: ASSET,
        assetUrl: ASSET_URL,
        dmOrigin: DM_ORIGIN,
        blockName: null,
        responsiveImageConfigPromise: Promise.resolve(false),
        onInsert: () => {},
        onBack: () => {},
        onCancel: () => {},
      });
      expect(result).to.be.false;
    } finally {
      cleanup(container);
      window.fetch = orgFetch;
    }
  });

  it('returns false when items key is missing', async () => {
    const orgFetch = window.fetch;
    window.fetch = mockFetchWithCrops({});
    const container = makeContainer();
    try {
      const result = await showSmartCropDialog({
        container,
        asset: ASSET,
        assetUrl: ASSET_URL,
        dmOrigin: DM_ORIGIN,
        blockName: null,
        responsiveImageConfigPromise: Promise.resolve(false),
        onInsert: () => {},
        onBack: () => {},
        onCancel: () => {},
      });
      expect(result).to.be.false;
    } finally {
      cleanup(container);
      window.fetch = orgFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// DOM rendering
// ---------------------------------------------------------------------------

describe('showSmartCropDialog — DOM rendering', () => {
  it('returns true and renders toolbar and crop list when crops are available', async () => {
    const orgFetch = window.fetch;
    window.fetch = mockFetchWithCrops();
    const container = makeContainer();
    try {
      const result = await showSmartCropDialog({
        container,
        asset: ASSET,
        assetUrl: ASSET_URL,
        dmOrigin: DM_ORIGIN,
        blockName: null,
        responsiveImageConfigPromise: Promise.resolve(false),
        onInsert: () => {},
        onBack: () => {},
        onCancel: () => {},
      });
      expect(result).to.be.true;
      expect(container.querySelector('.da-dialog-asset-crops-toolbar')).to.exist;
      expect(container.querySelector('.da-dialog-asset-crops')).to.exist;
    } finally {
      cleanup(container);
      window.fetch = orgFetch;
    }
  });

  it('renders Original crop plus each smart crop as list items', async () => {
    const orgFetch = window.fetch;
    window.fetch = mockFetchWithCrops();
    const container = makeContainer();
    try {
      await showSmartCropDialog({
        container,
        asset: ASSET,
        assetUrl: ASSET_URL,
        dmOrigin: DM_ORIGIN,
        blockName: null,
        responsiveImageConfigPromise: Promise.resolve(false),
        onInsert: () => {},
        onBack: () => {},
        onCancel: () => {},
      });
      const items = container.querySelectorAll('.da-dialog-asset-crops li');
      // original + desktop + mobile = 3
      expect(items.length).to.equal(3);
      expect(items[0].dataset.name).to.equal('original');
      expect(items[1].dataset.name).to.equal('desktop');
      expect(items[2].dataset.name).to.equal('mobile');
    } finally {
      cleanup(container);
      window.fetch = orgFetch;
    }
  });

  it('sets original as selected by default', async () => {
    const orgFetch = window.fetch;
    window.fetch = mockFetchWithCrops();
    const container = makeContainer();
    try {
      await showSmartCropDialog({
        container,
        asset: ASSET,
        assetUrl: ASSET_URL,
        dmOrigin: DM_ORIGIN,
        blockName: null,
        responsiveImageConfigPromise: Promise.resolve(false),
        onInsert: () => {},
        onBack: () => {},
        onCancel: () => {},
      });
      const selected = container.querySelector('.da-dialog-asset-crops .selected');
      expect(selected?.dataset.name).to.equal('original');
    } finally {
      cleanup(container);
      window.fetch = orgFetch;
    }
  });

  it('does not render structure selection when no responsive image config', async () => {
    const orgFetch = window.fetch;
    window.fetch = mockFetchWithCrops();
    const container = makeContainer();
    try {
      await showSmartCropDialog({
        container,
        asset: ASSET,
        assetUrl: ASSET_URL,
        dmOrigin: DM_ORIGIN,
        blockName: null,
        responsiveImageConfigPromise: Promise.resolve(false),
        onInsert: () => {},
        onBack: () => {},
        onCancel: () => {},
      });
      expect(container.querySelector('.da-dialog-asset-structure-select')).to.not.exist;
    } finally {
      cleanup(container);
      window.fetch = orgFetch;
    }
  });

  it('renders structure selection when responsive image config matches available crops', async () => {
    const orgFetch = window.fetch;
    window.fetch = mockFetchWithCrops();
    const container = makeContainer();
    const responsiveConfig = [
      { name: 'Full Width', position: 'everywhere', crops: ['desktop', 'mobile'] },
    ];
    try {
      await showSmartCropDialog({
        container,
        asset: ASSET,
        assetUrl: ASSET_URL,
        dmOrigin: DM_ORIGIN,
        blockName: null,
        responsiveImageConfigPromise: Promise.resolve(responsiveConfig),
        onInsert: () => {},
        onBack: () => {},
        onCancel: () => {},
      });
      expect(container.querySelector('.da-dialog-asset-structure-select')).to.exist;
      // "Single, Manual" + "Full Width" = 2 items
      const radios = container.querySelectorAll('.da-dialog-asset-structure-select input[type="radio"]');
      expect(radios.length).to.equal(2);
    } finally {
      cleanup(container);
      window.fetch = orgFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// Button callbacks
// ---------------------------------------------------------------------------

describe('showSmartCropDialog — button callbacks', () => {
  it('calls onCancel when Cancel button is clicked', async () => {
    const orgFetch = window.fetch;
    window.fetch = mockFetchWithCrops();
    const container = makeContainer();
    let cancelled = false;
    try {
      await showSmartCropDialog({
        container,
        asset: ASSET,
        assetUrl: ASSET_URL,
        dmOrigin: DM_ORIGIN,
        blockName: null,
        responsiveImageConfigPromise: Promise.resolve(false),
        onInsert: () => {},
        onBack: () => {},
        onCancel: () => { cancelled = true; },
      });
      container.querySelector('.cancel').click();
      expect(cancelled).to.be.true;
    } finally {
      cleanup(container);
      window.fetch = orgFetch;
    }
  });

  it('calls onBack when Back button is clicked', async () => {
    const orgFetch = window.fetch;
    window.fetch = mockFetchWithCrops();
    const container = makeContainer();
    let backed = false;
    try {
      await showSmartCropDialog({
        container,
        asset: ASSET,
        assetUrl: ASSET_URL,
        dmOrigin: DM_ORIGIN,
        blockName: null,
        responsiveImageConfigPromise: Promise.resolve(false),
        onInsert: () => {},
        onBack: () => { backed = true; },
        onCancel: () => {},
      });
      container.querySelector('.back').click();
      expect(backed).to.be.true;
    } finally {
      cleanup(container);
      window.fetch = orgFetch;
    }
  });

  it('calls onInsert with original crop src when Insert is clicked with no structure', async () => {
    const orgFetch = window.fetch;
    window.fetch = mockFetchWithCrops();
    const container = makeContainer();
    let insertedSrcs = null;
    try {
      await showSmartCropDialog({
        container,
        asset: ASSET,
        assetUrl: ASSET_URL,
        dmOrigin: DM_ORIGIN,
        blockName: null,
        responsiveImageConfigPromise: Promise.resolve(false),
        onInsert: (srcs) => { insertedSrcs = srcs; },
        onBack: () => {},
        onCancel: () => {},
      });
      container.querySelector('.insert').click();
      expect(insertedSrcs).to.be.an('array');
      expect(insertedSrcs.length).to.equal(1);
      // The selected crop is 'original' by default, its img src = ASSET_URL
      expect(insertedSrcs[0]).to.equal(ASSET_URL);
    } finally {
      cleanup(container);
      window.fetch = orgFetch;
    }
  });

  it('calls onInsert with all structure crops when a structure radio is selected', async () => {
    const orgFetch = window.fetch;
    window.fetch = mockFetchWithCrops();
    const container = makeContainer();
    let insertedSrcs = null;
    const responsiveConfig = [
      { name: 'Full Width', position: 'everywhere', crops: ['desktop', 'mobile'] },
    ];
    try {
      await showSmartCropDialog({
        container,
        asset: ASSET,
        assetUrl: ASSET_URL,
        dmOrigin: DM_ORIGIN,
        blockName: null,
        responsiveImageConfigPromise: Promise.resolve(responsiveConfig),
        onInsert: (srcs) => { insertedSrcs = srcs; },
        onBack: () => {},
        onCancel: () => {},
      });

      // Select the "Full Width" structure radio (index 1, after "single")
      const structureRadios = container.querySelectorAll('.da-dialog-asset-structure-select input');
      structureRadios[1].checked = true;
      structureRadios[1].dispatchEvent(new Event('change', { bubbles: true }));

      container.querySelector('.insert').click();

      expect(insertedSrcs).to.be.an('array');
      expect(insertedSrcs.length).to.equal(2);
    } finally {
      cleanup(container);
      window.fetch = orgFetch;
    }
  });

  it('switches selection back to original when structure is changed back to single', async () => {
    const orgFetch = window.fetch;
    window.fetch = mockFetchWithCrops();
    const container = makeContainer();
    const responsiveConfig = [
      { name: 'Full Width', position: 'everywhere', crops: ['desktop', 'mobile'] },
    ];
    try {
      await showSmartCropDialog({
        container,
        asset: ASSET,
        assetUrl: ASSET_URL,
        dmOrigin: DM_ORIGIN,
        blockName: null,
        responsiveImageConfigPromise: Promise.resolve(responsiveConfig),
        onInsert: () => {},
        onBack: () => {},
        onCancel: () => {},
      });

      const radios = container.querySelectorAll('.da-dialog-asset-structure-select input');
      // Select the structure radio
      radios[1].checked = true;
      radios[1].dispatchEvent(new Event('change', { bubbles: true }));

      // Switch back to single
      radios[0].checked = true;
      radios[0].dispatchEvent(new Event('change', { bubbles: true }));

      const selected = container.querySelector('.da-dialog-asset-crops .selected');
      expect(selected?.dataset.name).to.equal('original');
    } finally {
      cleanup(container);
      window.fetch = orgFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// Crop list click selection
// ---------------------------------------------------------------------------

describe('showSmartCropDialog — crop click selection', () => {
  it('selects a crop item when clicked and no structure is active', async () => {
    const orgFetch = window.fetch;
    window.fetch = mockFetchWithCrops();
    const container = makeContainer();
    try {
      await showSmartCropDialog({
        container,
        asset: ASSET,
        assetUrl: ASSET_URL,
        dmOrigin: DM_ORIGIN,
        blockName: null,
        responsiveImageConfigPromise: Promise.resolve(false),
        onInsert: () => {},
        onBack: () => {},
        onCancel: () => {},
      });

      const cropList = container.querySelector('.da-dialog-asset-crops');
      const desktopItem = cropList.querySelector('[data-name="desktop"]');
      desktopItem.click();

      expect(cropList.querySelector('.selected')?.dataset.name).to.equal('desktop');
    } finally {
      cleanup(container);
      window.fetch = orgFetch;
    }
  });

  it('does not change selection when a structure radio (non-single) is checked', async () => {
    const orgFetch = window.fetch;
    window.fetch = mockFetchWithCrops();
    const container = makeContainer();
    const responsiveConfig = [
      { name: 'Full Width', position: 'everywhere', crops: ['desktop', 'mobile'] },
    ];
    try {
      await showSmartCropDialog({
        container,
        asset: ASSET,
        assetUrl: ASSET_URL,
        dmOrigin: DM_ORIGIN,
        blockName: null,
        responsiveImageConfigPromise: Promise.resolve(responsiveConfig),
        onInsert: () => {},
        onBack: () => {},
        onCancel: () => {},
      });

      // Select the structure radio (non-single)
      const radios = container.querySelectorAll('.da-dialog-asset-structure-select input');
      radios[1].checked = true;
      radios[1].dispatchEvent(new Event('change', { bubbles: true }));

      // Click on desktop — should have no effect since structure is active
      const cropList = container.querySelector('.da-dialog-asset-crops');
      cropList.querySelector('[data-name="desktop"]').click();

      // 'original' should NOT be selected (structure selected desktop+mobile)
      expect(cropList.querySelector('[data-name="original"]').classList.contains('selected')).to.be.false;
    } finally {
      cleanup(container);
      window.fetch = orgFetch;
    }
  });
});
