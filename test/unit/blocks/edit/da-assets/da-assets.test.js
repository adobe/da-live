import { expect } from '@esm-bundle/chai';
import { EditorState, Schema } from 'da-y-wrapper';
import '../../../setup-nx.js';

const { getNx2 } = await import('../../../../../scripts/utils.js');
const { formatExternalBrief, buildHandleSelection, createDialogPanels } = await import('../../../../../blocks/edit/da-assets/da-assets.js');
const { DM_ERROR_MSG, MISSING_FORMAT_ERROR_MSG, PUBLISH_ERROR_MSG, selectionCalls, setSelection } = await import(`${getNx2()}/utils/aem-assets/selection.js`);
const { modifierCalls } = await import(`${getNx2()}/utils/aem-assets/image-modifiers.js`);

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    text: { group: 'inline' },
    image: {
      group: 'block',
      attrs: {
        src: {},
        alt: { default: null },
        style: { default: null },
        editAs: { default: null },
      },
      toDOM: (node) => ['img', node.attrs],
    },
  },
  marks: {
    link: {
      attrs: { href: {} },
      parseDOM: [{ tag: 'a[href]', getAttrs: (el) => ({ href: el.getAttribute('href') }) }],
      toDOM: (mark) => ['a', mark.attrs, 0],
    },
  },
});
const REPO_CONFIG = {
  tierType: 'author',
  assetOrigin: 'delivery-p1-e1.adobeaemcloud.com',
  assetBasePath: '/adobe/assets',
  isDmEnabled: true,
  isSmartCrop: false,
  imageType: null,
};
const ASSET = { 'repo:id': 'urn:aaid:aem:img-001', name: 'photo.jpg' };
const HREF = 'https://delivery-p1-e1.adobeaemcloud.com/photo.avif';
const IMAGE_SELECTION = { href: HREF, isImage: true, alt: 'A photo' };

function setup(repoConfig = REPO_CONFIG, responsiveImages = false) {
  const view = {
    state: EditorState.create({ schema }),
    dispatched: [],
    dispatch(tr) {
      this.dispatched.push(tr);
      this.state = this.state.apply(tr);
    },
  };
  let closed = false;
  const panels = createDialogPanels();
  document.body.append(panels.assetPanel, panels.secondaryPanel);
  const handler = buildHandleSelection({
    ...panels,
    repoConfig,
    responsiveImageConfigPromise: Promise.resolve(responsiveImages),
    getView: () => view,
    close: () => { closed = true; },
  });
  return { ...panels, view, handler, get closed() { return closed; } };
}

function imageAttrs(view) {
  const attrs = [];
  view.state.doc.descendants((node) => {
    if (node.type === schema.nodes.image) attrs.push(node.attrs);
  });
  return attrs;
}

describe('formatExternalBrief', () => {
  function makeDoc(text, title = '') {
    return {
      textContent: text,
      descendants: (fn) => {
        if (title) fn({ type: { name: 'heading' }, attrs: { level: 1 }, textContent: title });
      },
    };
  }

  it('returns empty string for empty content', () => {
    expect(formatExternalBrief(makeDoc(''))).to.equal('');
  });

  it('includes content and the first h1', () => {
    const brief = formatExternalBrief(makeDoc('We sell shoes.', 'Products'));
    expect(brief).to.include('We sell shoes.').and.include('Title: Products');
  });

  it('omits the title line when there is no h1', () => {
    expect(formatExternalBrief(makeDoc('Shoes'))).to.not.include('Title:');
  });
});

describe('buildHandleSelection', () => {
  let savedFetch;
  beforeEach(() => {
    savedFetch = window.fetch;
    selectionCalls.length = 0;
    modifierCalls.length = 0;
    setSelection(IMAGE_SELECTION);
  });
  afterEach(() => {
    window.fetch = savedFetch;
    document.querySelectorAll('.da-dialog-asset-inner').forEach((el) => el.remove());
  });

  function mockSmartCrops(items) {
    window.fetch = async () => ({ ok: true, json: async () => ({ items }) });
  }

  it('ignores an empty selection', async () => {
    const result = setup();
    await result.handler([]);
    expect(selectionCalls).to.have.length(0);
    expect(result.view.dispatched).to.have.length(0);
    expect(result.closed).to.be.false;
  });

  it('ignores selections when there is no editor view', async () => {
    const handler = buildHandleSelection({ getView: () => null });
    await handler([ASSET]);
    expect(selectionCalls).to.have.length(0);
  });

  it('passes the asset and repository config to the shared resolver', async () => {
    const result = setup();
    await result.handler([ASSET]);
    expect(selectionCalls).to.deep.equal([{ asset: ASSET, repoConfig: REPO_CONFIG }]);
  });

  it('ignores assets without a format', async () => {
    setSelection({ error: MISSING_FORMAT_ERROR_MSG });
    const result = setup();
    await result.handler([ASSET]);
    expect(result.closed).to.be.false;
    expect(result.view.dispatched).to.have.length(0);
    expect(result.secondaryPanel.innerHTML).to.equal('');
  });

  [null, 'editable-link'].forEach((imageType) => {
    it(`inserts resolved images with imageType=${imageType}`, async () => {
      const result = setup({ ...REPO_CONFIG, imageType });
      await result.handler([ASSET]);
      expect(result.closed).to.be.true;
      expect(imageAttrs(result.view)).to.deep.equal([{
        src: HREF,
        alt: 'A photo',
        style: 'width: 180px',
        editAs: imageType === 'editable-link' ? 'image' : null,
      }]);
    });

    it(`preserves imageType=${imageType} when Smart Crop has no crops`, async () => {
      mockSmartCrops([]);
      const result = setup({ ...REPO_CONFIG, imageType, isSmartCrop: true });
      await result.handler([ASSET]);
      expect(result.closed).to.be.true;
      expect(imageAttrs(result.view)[0]).to.include({ src: HREF, alt: 'A photo', editAs: imageType === 'editable-link' ? 'image' : null });
    });

    it(`preserves imageType=${imageType} for selected Smart Crops`, async () => {
      mockSmartCrops([{ name: 'desktop' }, { name: 'mobile' }]);
      const result = setup(
        { ...REPO_CONFIG, imageType, isSmartCrop: true, siteImageModifiers: 'width=1920' },
        [{ name: 'Responsive', position: 'everywhere', crops: ['desktop', 'mobile'] }],
      );
      await result.handler([ASSET]);
      expect(result.closed).to.be.false;
      expect(result.secondaryPanel.querySelector('[data-name="original"] img').src).to.equal(HREF);
      const structure = result.secondaryPanel.querySelector('input[value]:not([value="single"])');
      structure.checked = true;
      structure.dispatchEvent(new Event('change', { bubbles: true }));
      result.secondaryPanel.querySelector('.insert').click();
      expect(result.closed).to.be.true;
      const attrs = imageAttrs(result.view);
      expect(attrs).to.have.length(2);
      attrs.forEach((value) => expect(value).to.include({ alt: 'A photo', editAs: imageType === 'editable-link' ? 'image' : null }));
      expect(modifierCalls).to.deep.equal(attrs.map(({ src }) => ({ src, modifiers: 'width=1920' })));
    });
  });

  [
    ['non-image', { href: HREF, isImage: false, alt: '' }, 'editable-link'],
    ['plain image link', IMAGE_SELECTION, 'link'],
    ['legacy shared config', IMAGE_SELECTION, undefined],
  ].forEach(([name, selection, imageType]) => {
    it(`inserts a link for ${name}`, async () => {
      setSelection(selection);
      const result = setup({ ...REPO_CONFIG, imageType, insertAsLink: true });
      await result.handler([ASSET]);
      expect(result.closed).to.be.true;
      expect(imageAttrs(result.view)).to.have.length(0);
      const links = [];
      result.view.state.doc.descendants((node) => {
        links.push(...node.marks.filter((mark) => mark.type === schema.marks.link));
      });
      expect(links).to.have.length(1);
      expect(links[0].attrs.href).to.equal(HREF);
    });
  });

  [DM_ERROR_MSG, PUBLISH_ERROR_MSG].forEach((message) => {
    it(`shows the shared error "${message}" without inserting`, async () => {
      setSelection({ error: message });
      const result = setup();
      await result.handler([ASSET]);
      expect(result.closed).to.be.false;
      expect(result.view.dispatched).to.have.length(0);
      expect(result.assetPanel.style.display).to.equal('none');
      expect(result.secondaryPanel.querySelector('.da-dialog-asset-error').textContent).to.equal(message);
      result.secondaryPanel.querySelector('.back').click();
      expect(result.assetPanel.style.display).to.equal('block');
      expect(result.secondaryPanel.innerHTML).to.equal('');
    });
  });

  it('closes and resets the error panel on cancel', async () => {
    setSelection({ error: DM_ERROR_MSG });
    const result = setup();
    await result.handler([ASSET]);
    result.secondaryPanel.querySelector('.cancel').click();
    expect(result.closed).to.be.true;
    expect(result.secondaryPanel.style.display).to.equal('none');
  });
});

describe('createDialogPanels', () => {
  it('creates matching panels with the secondary panel hidden', () => {
    const { assetPanel, secondaryPanel } = createDialogPanels();
    expect(assetPanel.tagName).to.equal('DIV');
    expect(secondaryPanel.tagName).to.equal('DIV');
    expect(assetPanel.className).to.equal('da-dialog-asset-inner');
    expect(secondaryPanel.className).to.equal(assetPanel.className);
    expect(secondaryPanel.style.display).to.equal('none');
  });
});
