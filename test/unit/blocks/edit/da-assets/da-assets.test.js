import { expect } from '@esm-bundle/chai';

const { setNx, getNx2 } = await import('../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const {
  formatExternalBrief,
  buildHandleSelection,
  createDialogPanels,
} = await import('../../../../../blocks/edit/da-assets/da-assets.js');
const {
  DM_ERROR_MSG,
  MISSING_FORMAT_ERROR_MSG,
  PUBLISH_ERROR_MSG,
  selectionCalls,
  setSelection,
} = await import(`${getNx2()}/utils/aem-assets/selection.js`);

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

// Minimal mock of a ProseMirror view with a tracked dispatch spy.
function makeView() {
  const dispatched = [];
  const created = [];
  const schema = {
    nodes: {
      image: {
        create: (attrs) => {
          created.push(attrs);
          return { type: 'image', attrs };
        },
      },
    },
  };
  const tr = {
    replaceSelectionWith: () => tr,
    insert: () => tr,
    deleteSelection: () => tr,
    scrollIntoView: () => tr,
  };
  return {
    dispatched,
    created,
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

const REPO_CONFIG = {
  tierType: 'author',
  assetOrigin: 'delivery-p1-e1.adobeaemcloud.com',
  assetBasePath: '/adobe/assets',
  isDmEnabled: true,
  isSmartCrop: false,
  insertAsLink: false,
};

const ASSET = { 'repo:id': 'urn:aaid:aem:img-001', name: 'photo.jpg' };
const IMAGE_HREF = 'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:img-001/as/photo.avif';
const IMAGE_SELECTION = { href: IMAGE_HREF, isImage: true, alt: 'A photo' };
const PDF_SELECTION = { href: 'https://delivery-p1-e1.adobeaemcloud.com/doc.pdf', isImage: false, alt: '' };

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
// buildHandleSelection
// ---------------------------------------------------------------------------

describe('buildHandleSelection', () => {
  let orgFetch;
  beforeEach(() => {
    orgFetch = window.fetch;
    selectionCalls.length = 0;
    setSelection(IMAGE_SELECTION);
  });
  afterEach(() => { window.fetch = orgFetch; });

  function setup(repoConfig = REPO_CONFIG) {
    const view = makeView();
    const dialog = makeDialog();
    const assetPanel = makePanel();
    const secondaryPanel = makePanel();
    const handler = buildHandleSelection({
      assetPanel,
      secondaryPanel,
      repoConfig,
      responsiveImageConfigPromise: Promise.resolve(false),
      getView: () => view,
      close: () => dialog.close(),
    });
    return { view, dialog, assetPanel, secondaryPanel, handler };
  }

  function mockSmartCrops(items) {
    window.fetch = async () => ({ ok: true, json: async () => ({ items }) });
  }

  it('does nothing when assets array is empty', async () => {
    const { view, dialog, handler } = setup();
    await handler([]);
    expect(selectionCalls).to.have.length(0);
    expect(view.dispatched).to.have.length(0);
    expect(dialog.isOpen).to.be.true;
  });

  it('resolves the selected asset with the repository config', async () => {
    const { handler } = setup();
    await handler([ASSET]);
    expect(selectionCalls).to.deep.equal([{ asset: ASSET, repoConfig: REPO_CONFIG }]);
  });

  it('does nothing when the asset has no format', async () => {
    setSelection({ error: MISSING_FORMAT_ERROR_MSG });
    const { view, dialog, secondaryPanel, handler } = setup();
    await handler([ASSET]);
    expect(view.dispatched).to.have.length(0);
    expect(dialog.isOpen).to.be.true;
    expect(secondaryPanel.innerHTML).to.equal('');
  });

  it('closes dialog and inserts the resolved image with its alt text', async () => {
    const { view, dialog, handler } = setup();
    await handler([ASSET]);
    expect(dialog.isOpen).to.be.false;
    expect(view.dispatched).to.have.length(1);
    expect(view.created).to.deep.equal([{ src: IMAGE_HREF, style: 'width: 180px', alt: 'A photo' }]);
  });

  it('closes dialog and takes link path for non-image assets', async () => {
    setSelection(PDF_SELECTION);
    const { view, dialog, handler } = setup();
    // dialog.close() is called before insertLink, so we can verify dialog state
    // even though proseDOMParser needs a real schema (tested in insert.test.js)
    try { await handler([ASSET]); } catch { /* proseDOMParser mock limitation */ }
    expect(dialog.isOpen).to.be.false;
    expect(view.created).to.have.length(0);
  });

  it('closes dialog and takes link path for image when insertAsLink is true', async () => {
    const { view, dialog, handler } = setup({ ...REPO_CONFIG, insertAsLink: true });
    try { await handler([ASSET]); } catch { /* proseDOMParser mock limitation */ }
    expect(dialog.isOpen).to.be.false;
    expect(view.created).to.have.length(0);
  });

  [DM_ERROR_MSG, PUBLISH_ERROR_MSG].forEach((message) => {
    it(`shows the error panel for "${message}" and keeps the dialog open`, async () => {
      setSelection({ error: message });
      const { view, dialog, assetPanel, secondaryPanel, handler } = setup();
      await handler([ASSET]);
      expect(dialog.isOpen).to.be.true;
      expect(view.dispatched).to.have.length(0);
      expect(assetPanel.style.display).to.equal('none');
      expect(secondaryPanel.querySelector('.da-dialog-asset-error').textContent).to.equal(message);
    });
  });

  it('shows smart crop panel for image when isSmartCrop is true (crops available)', async () => {
    mockSmartCrops([{ name: 'desktop' }, { name: 'mobile' }]);
    const { secondaryPanel, handler } = setup({ ...REPO_CONFIG, isSmartCrop: true });
    await handler([ASSET]);
    expect(secondaryPanel.style.display).to.equal('block');
    expect(secondaryPanel.querySelector('.da-dialog-asset-crops')).to.exist;
    expect(secondaryPanel.querySelector('[data-name="original"] img').getAttribute('src')).to.equal(IMAGE_HREF);
  });

  it('inserts image directly when isSmartCrop is true but no crops available', async () => {
    mockSmartCrops([]);
    const { view, dialog, handler } = setup({ ...REPO_CONFIG, isSmartCrop: true });
    await handler([ASSET]);
    expect(dialog.isOpen).to.be.false;
    expect(view.dispatched).to.have.length(1);
    expect(view.created[0].src).to.equal(IMAGE_HREF);
  });

  it('calls onInsert callback from smart crop dialog, closing dialog and inserting nodes', async () => {
    mockSmartCrops([{ name: 'desktop' }, { name: 'mobile' }]);
    const { dialog, assetPanel, secondaryPanel, handler } = setup(
      { ...REPO_CONFIG, isSmartCrop: true },
    );
    document.body.append(assetPanel, secondaryPanel);
    await handler([ASSET]);

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
