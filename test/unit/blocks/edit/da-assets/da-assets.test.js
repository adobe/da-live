import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../../scripts/utils.js');
setNx('/bheuaark/', { hostname: 'localhost' });

const {
  formatExternalBrief,
  buildFeatureSet,
  resolveAssetUrl,
  buildHandleSelection,
  createDialogPanels,
} = await import('../../../../../blocks/edit/da-assets/da-assets.js');

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

// Minimal mock of a ProseMirror view with a tracked dispatch spy.
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
    state: {
      schema,
      selection: { $from: { depth: 0, node: () => null }, from: 0 },
      tr,
    },
    dispatch: (t) => dispatched.push(t),
  };
}

function makeDialog() {
  let open = true;
  return {
    close: () => { open = false; },
    get isOpen() { return open; },
  };
}

function makePanel() {
  return document.createElement('div');
}

// Base repo configs for the three modes
const AUTHOR_PUBLISH_CONFIG = {
  repositoryId: 'author-p1-e1.adobeaemcloud.com',
  tierType: 'author',
  assetOrigin: 'publish-p1-e1.adobeaemcloud.com',
  isDmEnabled: false,
  isSmartCrop: false,
  insertAsLink: false,
};

const AUTHOR_DM_CONFIG = {
  repositoryId: 'author-p1-e1.adobeaemcloud.com',
  tierType: 'author',
  assetOrigin: 'delivery-p1-e1.adobeaemcloud.com',
  isDmEnabled: true,
  isSmartCrop: false,
  insertAsLink: false,
};

const DELIVERY_CONFIG = {
  repositoryId: 'delivery-p1-e1.adobeaemcloud.com',
  tierType: 'delivery',
  assetOrigin: 'delivery-p1-e1.adobeaemcloud.com',
  isDmEnabled: true,
  isSmartCrop: false,
  insertAsLink: false,
};

// ---------------------------------------------------------------------------
// formatExternalBrief
// ---------------------------------------------------------------------------

describe('formatExternalBrief', () => {
  function makeDoc(text, h1Title = '') {
    const nodes = [];
    if (h1Title) {
      nodes.push({
        type: { name: 'heading' },
        attrs: { level: 1 },
        textContent: h1Title,
        descendants: (fn) => { fn({ type: { name: 'text' }, textContent: h1Title }); },
      });
    }
    return {
      textContent: text,
      descendants: (fn) => {
        if (h1Title) {
          fn({ type: { name: 'heading' }, attrs: { level: 1 }, textContent: h1Title });
        }
      },
    };
  }

  it('returns empty string when document has no text content', () => {
    const doc = makeDoc('');
    expect(formatExternalBrief(doc)).to.equal('');
  });

  it('includes content text in brief', () => {
    const doc = makeDoc('We sell great shoes.');
    const brief = formatExternalBrief(doc);
    expect(brief).to.include('We sell great shoes.');
  });

  it('includes h1 title in brief when present', () => {
    const doc = makeDoc('We sell great shoes.', 'Our Products');
    const brief = formatExternalBrief(doc);
    expect(brief).to.include('Title: Our Products');
  });

  it('omits title line when no h1 is present', () => {
    const doc = makeDoc('Some page content without a heading.');
    const brief = formatExternalBrief(doc);
    expect(brief).to.not.include('Title:');
    expect(brief).to.include('Some page content without a heading.');
  });
});

// ---------------------------------------------------------------------------
// buildFeatureSet
// ---------------------------------------------------------------------------

describe('buildFeatureSet', () => {
  it('returns base features when DM is not enabled', () => {
    const features = buildFeatureSet(false);
    expect(features).to.deep.equal(['upload', 'collections', 'detail-panel', 'advisor']);
  });

  it('adds dynamic-media feature when DM is enabled', () => {
    const features = buildFeatureSet(true);
    expect(features).to.include('dynamic-media');
    expect(features).to.include('upload');
  });
});

// ---------------------------------------------------------------------------
// resolveAssetUrl
// ---------------------------------------------------------------------------

describe('resolveAssetUrl', () => {
  const AUTHOR_IMAGE = {
    name: 'photo.jpg',
    path: '/content/dam/photo.jpg',
    mimetype: 'image/jpeg',
    'repo:id': 'urn:aaid:aem:img-001',
    _links: {},
  };
  const DELIVERY_IMAGE = {
    'repo:assetId': 'urn:aaid:aem:del-001',
    'repo:name': 'photo.jpg',
    'repo:repositoryId': 'delivery-p1-e1.adobeaemcloud.com',
    'dc:format': 'image/jpeg',
  };

  it('uses buildAuthorUrl for author+publish mode', () => {
    const url = resolveAssetUrl(AUTHOR_IMAGE, AUTHOR_PUBLISH_CONFIG);
    expect(url).to.equal('https://publish-p1-e1.adobeaemcloud.com/content/dam/photo.jpg');
  });

  it('uses buildDmUrl for author+DM mode', () => {
    const url = resolveAssetUrl(AUTHOR_IMAGE, AUTHOR_DM_CONFIG);
    expect(url).to.include('/adobe/assets/urn:aaid:aem:img-001/as/photo.jpg');
    expect(url).to.include('delivery-p1-e1.adobeaemcloud.com');
  });

  it('uses buildDeliveryUrl for delivery tier', () => {
    const url = resolveAssetUrl(DELIVERY_IMAGE, DELIVERY_CONFIG);
    expect(url).to.equal('https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:del-001/as/photo.jpg');
  });
});

// ---------------------------------------------------------------------------
// buildHandleSelection
// ---------------------------------------------------------------------------

describe('buildHandleSelection', () => {
  let orgFetch;
  beforeEach(() => { orgFetch = window.fetch; });
  afterEach(() => { window.fetch = orgFetch; });

  function setup(repoConfig = AUTHOR_PUBLISH_CONFIG) {
    const view = makeView();
    window.view = view;
    const dialog = makeDialog();
    const assetPanel = makePanel();
    const secondaryPanel = makePanel();
    const handler = buildHandleSelection(
      dialog,
      assetPanel,
      secondaryPanel,
      repoConfig,
      Promise.resolve(false),
    );
    return { view, dialog, assetPanel, secondaryPanel, handler };
  }

  const IMAGE_ASSET = {
    'aem:formatName': 'jpeg',
    mimetype: 'image/jpeg',
    name: 'photo.jpg',
    path: '/content/dam/photo.jpg',
    'repo:id': 'urn:aaid:aem:img-001',
    _links: {},
    _embedded: {
      'http://ns.adobe.com/adobecloud/rel/metadata/asset': {
        'dam:assetStatus': 'approved',
        'dam:activationTarget': 'delivery',
      },
    },
  };

  const PDF_ASSET = {
    'aem:formatName': 'pdf',
    mimetype: 'application/pdf',
    name: 'doc.pdf',
    path: '/content/dam/doc.pdf',
    'repo:id': 'urn:aaid:aem:pdf-001',
    _links: {},
    _embedded: {
      'http://ns.adobe.com/adobecloud/rel/metadata/asset': {
        'dam:assetStatus': 'approved',
        'dam:activationTarget': 'delivery',
      },
    },
  };

  it('does nothing when assets array is empty', async () => {
    const { view, dialog } = setup();
    await buildHandleSelection(
      dialog,
      makePanel(),
      makePanel(),
      AUTHOR_PUBLISH_CONFIG,
      Promise.resolve(false),
    )([]);
    expect(view.dispatched).to.have.length(0);
    expect(dialog.isOpen).to.be.true;
  });

  it('does nothing when asset has no aem:formatName', async () => {
    const { view, dialog, handler } = setup();
    await handler([{ mimetype: 'image/jpeg' }]);
    expect(view.dispatched).to.have.length(0);
    expect(dialog.isOpen).to.be.true;
  });

  it('closes dialog and dispatches insert for a standard image (author+publish)', async () => {
    const { view, dialog, handler } = setup(AUTHOR_PUBLISH_CONFIG);
    await handler([IMAGE_ASSET]);
    expect(dialog.isOpen).to.be.false;
    expect(view.dispatched).to.have.length(1);
  });

  it('closes dialog and takes link path for non-image assets', async () => {
    const { view, dialog, handler } = setup(AUTHOR_PUBLISH_CONFIG);
    // dialog.close() is called before insertLink, so we can verify dialog state
    // even though proseDOMParser needs a real schema (tested in insert.test.js)
    try { await handler([PDF_ASSET]); } catch { /* proseDOMParser mock limitation */ }
    expect(dialog.isOpen).to.be.false;
    // insertImage dispatches; insertLink does not reach dispatch before the parse error
    // — confirms the code branched to insertLink not insertImage
    expect(view.dispatched).to.have.length(0);
  });

  it('closes dialog and takes link path for image when insertAsLink is true', async () => {
    const { view, dialog, handler } = setup({ ...AUTHOR_PUBLISH_CONFIG, insertAsLink: true });
    try { await handler([IMAGE_ASSET]); } catch { /* proseDOMParser mock limitation */ }
    expect(dialog.isOpen).to.be.false;
    expect(view.dispatched).to.have.length(0);
  });

  it('shows error panel for unapproved asset in author+DM mode', async () => {
    const { dialog, secondaryPanel, handler } = setup(AUTHOR_DM_CONFIG);
    const unapproved = {
      ...IMAGE_ASSET,
      _embedded: {
        'http://ns.adobe.com/adobecloud/rel/metadata/asset': {
          'dam:assetStatus': 'draft',
          'dam:activationTarget': 'author',
        },
      },
    };
    await handler([unapproved]);
    // Dialog stays open, error panel shown
    expect(dialog.isOpen).to.be.true;
    expect(secondaryPanel.querySelector('.da-dialog-asset-error')).to.exist;
  });

  it('shows error panel when approved but activationTarget is not delivery', async () => {
    const { dialog, secondaryPanel, handler } = setup(AUTHOR_DM_CONFIG);
    const noTarget = {
      ...IMAGE_ASSET,
      _embedded: {
        'http://ns.adobe.com/adobecloud/rel/metadata/asset': {
          'dam:assetStatus': 'approved',
          'dam:activationTarget': 'author',
        },
      },
    };
    await handler([noTarget]);
    expect(dialog.isOpen).to.be.true;
    expect(secondaryPanel.querySelector('.da-dialog-asset-error')).to.exist;
  });

  it('does NOT show error panel for approved+delivery asset in author+DM mode', async () => {
    window.fetch = async () => ({ ok: true, json: async () => ({ items: [] }) });
    const { secondaryPanel, handler } = setup({ ...AUTHOR_DM_CONFIG, isSmartCrop: false });
    await handler([IMAGE_ASSET]);
    expect(secondaryPanel.querySelector('.da-dialog-asset-error')).to.not.exist;
  });

  it('does NOT check approval for delivery tier assets', async () => {
    const { dialog, secondaryPanel, handler } = setup(DELIVERY_CONFIG);
    // Delivery tier assets don't have _embedded metadata
    const deliveryAsset = {
      'aem:formatName': 'jpeg',
      'dc:format': 'image/jpeg',
      'repo:assetId': 'urn:aaid:aem:del-001',
      'repo:name': 'photo.jpg',
      'repo:repositoryId': 'delivery-p1-e1.adobeaemcloud.com',
    };
    await handler([deliveryAsset]);
    expect(dialog.isOpen).to.be.false;
    expect(secondaryPanel.querySelector('.da-dialog-asset-error')).to.not.exist;
  });

  it('shows smart crop panel for image when isSmartCrop is true (crops available)', async () => {
    window.fetch = async () => ({
      ok: true,
      json: async () => ({ items: [{ name: 'desktop' }, { name: 'mobile' }] }),
    });
    const { dialog, assetPanel, secondaryPanel } = setup(
      { ...AUTHOR_DM_CONFIG, isSmartCrop: true },
    );
    const handler = buildHandleSelection(
      dialog,
      assetPanel,
      secondaryPanel,
      { ...AUTHOR_DM_CONFIG, isSmartCrop: true },
      Promise.resolve(false),
    );
    await handler([IMAGE_ASSET]);
    // secondary panel should be visible with smart crop UI
    expect(secondaryPanel.style.display).to.equal('block');
    expect(secondaryPanel.querySelector('.da-dialog-asset-crops')).to.exist;
  });

  it('inserts image directly when isSmartCrop is true but no crops available', async () => {
    window.fetch = async () => ({
      ok: true,
      json: async () => ({ items: [] }),
    });
    const { dialog, view } = setup({ ...AUTHOR_DM_CONFIG, isSmartCrop: true });
    const assetPanel = makePanel();
    const secondaryPanel = makePanel();
    const handler = buildHandleSelection(
      dialog,
      assetPanel,
      secondaryPanel,
      { ...AUTHOR_DM_CONFIG, isSmartCrop: true },
      Promise.resolve(false),
    );
    await handler([IMAGE_ASSET]);
    expect(dialog.isOpen).to.be.false;
    expect(view.dispatched).to.have.length(1);
  });

  it('calls onInsert callback from smart crop dialog, closing dialog and inserting nodes', async () => {
    window.fetch = async () => ({
      ok: true,
      json: async () => ({ items: [{ name: 'desktop' }, { name: 'mobile' }] }),
    });
    const view = makeView();
    window.view = view;
    const dialog = makeDialog();
    const assetPanel = makePanel();
    const secondaryPanel = makePanel();
    document.body.append(assetPanel, secondaryPanel);

    const handler = buildHandleSelection(
      dialog,
      assetPanel,
      secondaryPanel,
      { ...AUTHOR_DM_CONFIG, isSmartCrop: true },
      Promise.resolve(false),
    );
    await handler([IMAGE_ASSET]);

    // Smart crop panel is now shown — click Insert to trigger onInsert callback
    const insertBtn = secondaryPanel.querySelector('.insert');
    expect(insertBtn).to.exist;

    // onInsert calls closeAndReset() then insertFragment() — catch ProseMirror mock limitation
    try { insertBtn.click(); } catch { /* Fragment.fromArray needs real nodes */ }
    expect(dialog.isOpen).to.be.false;

    assetPanel.remove();
    secondaryPanel.remove();
  });
});

// ---------------------------------------------------------------------------
// createDialogPanels
// ---------------------------------------------------------------------------

describe('createDialogPanels', () => {
  it('returns assetPanel and secondaryPanel div elements', () => {
    const { assetPanel, secondaryPanel } = createDialogPanels();
    expect(assetPanel.tagName).to.equal('DIV');
    expect(secondaryPanel.tagName).to.equal('DIV');
  });

  it('assetPanel has class da-dialog-asset-inner', () => {
    const { assetPanel } = createDialogPanels();
    expect(assetPanel.className).to.equal('da-dialog-asset-inner');
  });

  it('secondaryPanel is hidden by default', () => {
    const { secondaryPanel } = createDialogPanels();
    expect(secondaryPanel.style.display).to.equal('none');
  });

  it('secondaryPanel has class da-dialog-asset-inner', () => {
    const { secondaryPanel } = createDialogPanels();
    expect(secondaryPanel.className).to.equal('da-dialog-asset-inner');
  });
});
