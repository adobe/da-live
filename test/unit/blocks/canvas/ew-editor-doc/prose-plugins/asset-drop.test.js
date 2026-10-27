import { expect } from '@esm-bundle/chai';
import { setNx, getNx2 } from '../../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let readDroppedAssets;
let buildAssetNodes;
let dropAssets;
let imageDrop;
let ASSET_DRAG_DATA_TYPE;
let DM_ERROR_MSG;
let MISSING_FORMAT_ERROR_MSG;
let setSelectionFor;
let resetSelections;
let setRepositoryConfig;
let toasts;

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

before(async () => {
  ({ readDroppedAssets, buildAssetNodes, dropAssets } = await import('../../../../../../blocks/canvas/ew-editor-doc/prose-plugins/assetDrop.js'));
  ({ default: imageDrop } = await import('../../../../../../blocks/canvas/ew-editor-doc/prose-plugins/imageDrop.js'));
  ({ ASSET_DRAG_DATA_TYPE } = await import(`${getNx2()}/utils/aem-assets/selector-props.js`));
  ({
    DM_ERROR_MSG,
    MISSING_FORMAT_ERROR_MSG,
    setSelectionFor,
    resetSelections,
  } = await import(`${getNx2()}/utils/aem-assets/selection.js`));
  ({ setRepositoryConfig } = await import(`${getNx2()}/utils/aem-assets/repository-config.js`));
  ({ toasts } = await import('../../../../../fixtures/nx2/blocks/shared/toast/toast.js'));
});

const REPO_CONFIG = {
  repositoryId: 'author-p1-e1.adobeaemcloud.com',
  tierType: 'author',
  insertAsLink: false,
};

function dataTransferWithAssets(assets) {
  const dt = new DataTransfer();
  dt.setData(ASSET_DRAG_DATA_TYPE, JSON.stringify(assets));
  return dt;
}

afterEach(() => {
  resetSelections();
  setRepositoryConfig(null);
  toasts.length = 0;
});

describe('ASSET_DRAG_DATA_TYPE', () => {
  it('matches the hardcoded type readDroppedAssets looks for', () => {
    expect(ASSET_DRAG_DATA_TYPE).to.equal('collectionviewdata');
  });
});

describe('readDroppedAssets', () => {
  it('returns null when the asset drag type is absent', () => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'hello');
    expect(readDroppedAssets(dt)).to.equal(null);
  });

  it('returns null when the JSON cannot be parsed', () => {
    const dt = new DataTransfer();
    dt.setData(ASSET_DRAG_DATA_TYPE, 'not json');
    expect(readDroppedAssets(dt)).to.equal(null);
  });

  it('returns null when the JSON is not an array', () => {
    const dt = new DataTransfer();
    dt.setData(ASSET_DRAG_DATA_TYPE, JSON.stringify({ not: 'an array' }));
    expect(readDroppedAssets(dt)).to.equal(null);
  });

  it('returns the parsed array for valid JSON', () => {
    const assets = [{ id: 'one' }, { id: 'two' }];
    const dt = dataTransferWithAssets(assets);
    expect(readDroppedAssets(dt)).to.deep.equal(assets);
  });
});

describe('buildAssetNodes', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor();
  });

  afterEach(() => {
    destroyEditor(editor);
  });

  it('builds an image node for an image asset', async () => {
    const asset = { id: 'img-1' };
    setSelectionFor(asset, { href: 'https://example.com/pic.png', isImage: true, alt: 'A pic' });
    const { nodes, errors } = await buildAssetNodes(editor.view.state.schema, [asset], REPO_CONFIG);
    expect(errors).to.deep.equal([]);
    expect(nodes).to.have.length(1);
    expect(nodes[0].type.name).to.equal('image');
    expect(nodes[0].attrs.src).to.equal('https://example.com/pic.png');
    expect(nodes[0].attrs.alt).to.equal('A pic');
  });

  it('builds a link mark for a non-image asset', async () => {
    const asset = { id: 'pdf-1' };
    setSelectionFor(asset, { href: 'https://example.com/doc.pdf', isImage: false, alt: '' });
    const { nodes, errors } = await buildAssetNodes(editor.view.state.schema, [asset], REPO_CONFIG);
    expect(errors).to.deep.equal([]);
    expect(nodes).to.have.length(1);
    expect(nodes[0].isText).to.equal(true);
    expect(nodes[0].text).to.equal('https://example.com/doc.pdf');
    const linkMark = nodes[0].marks.find((m) => m.type.name === 'link');
    expect(linkMark.attrs.href).to.equal('https://example.com/doc.pdf');
  });

  it('builds a link for an image asset when insertAsLink is true', async () => {
    const asset = { id: 'img-2' };
    setSelectionFor(asset, { href: 'https://example.com/pic2.png', isImage: true, alt: '' });
    const { nodes, errors } = await buildAssetNodes(
      editor.view.state.schema,
      [asset],
      { ...REPO_CONFIG, insertAsLink: true },
    );
    expect(errors).to.deep.equal([]);
    expect(nodes).to.have.length(1);
    expect(nodes[0].isText).to.equal(true);
    const linkMark = nodes[0].marks.find((m) => m.type.name === 'link');
    expect(linkMark.attrs.href).to.equal('https://example.com/pic2.png');
  });

  it('skips a missing-format asset silently', async () => {
    const asset = { id: 'bad-1' };
    setSelectionFor(asset, { error: MISSING_FORMAT_ERROR_MSG });
    const { nodes, errors } = await buildAssetNodes(editor.view.state.schema, [asset], REPO_CONFIG);
    expect(nodes).to.deep.equal([]);
    expect(errors).to.deep.equal([]);
  });

  it('records a DM error once even when two assets share it', async () => {
    const assetA = { id: 'dm-1' };
    const assetB = { id: 'dm-2' };
    setSelectionFor(assetA, { error: DM_ERROR_MSG });
    setSelectionFor(assetB, { error: DM_ERROR_MSG });
    const { nodes, errors } = await buildAssetNodes(
      editor.view.state.schema,
      [assetA, assetB],
      REPO_CONFIG,
    );
    expect(nodes).to.deep.equal([]);
    expect(errors).to.deep.equal([DM_ERROR_MSG]);
  });
});

describe('dropAssets', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor();
    await nextFrame();
  });

  afterEach(() => {
    destroyEditor(editor);
  });

  it('inserts two images in order at the dropped position', async () => {
    const assetA = { id: 'a' };
    const assetB = { id: 'b' };
    setSelectionFor(assetA, { href: 'https://example.com/a.png', isImage: true, alt: 'A' });
    setSelectionFor(assetB, { href: 'https://example.com/b.png', isImage: true, alt: 'B' });

    const { view } = editor;
    const dropPos = 1;
    view.posAtCoords = () => ({ pos: dropPos });

    const count = await dropAssets(view, {
      assets: [assetA, assetB],
      coords: { left: 10, top: 10 },
      getRepoConfig: async () => REPO_CONFIG,
    });

    expect(count).to.equal(2);
    const sources = [];
    view.state.doc.descendants((node) => {
      if (node.type.name === 'image') sources.push(node.attrs.src);
    });
    expect(sources).to.deep.equal(['https://example.com/a.png', 'https://example.com/b.png']);
  });

  it('falls back to the selection when posAtCoords returns null', async () => {
    const asset = { id: 'a' };
    setSelectionFor(asset, { href: 'https://example.com/a.png', isImage: true, alt: 'A' });

    const { view } = editor;
    view.posAtCoords = () => null;
    const selectionFrom = view.state.selection.from;

    const count = await dropAssets(view, {
      assets: [asset],
      coords: { left: 10, top: 10 },
      getRepoConfig: async () => REPO_CONFIG,
    });

    expect(count).to.equal(1);
    let found;
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') found = pos;
    });
    expect(found).to.equal(selectionFrom);
  });

  it('inserts nothing and returns 0 when not editable', async () => {
    const readOnly = await createTestEditor({ editable: false });
    try {
      const asset = { id: 'a' };
      setSelectionFor(asset, { href: 'https://example.com/a.png', isImage: true, alt: 'A' });
      readOnly.view.posAtCoords = () => ({ pos: 1 });

      const count = await dropAssets(readOnly.view, {
        assets: [asset],
        coords: { left: 10, top: 10 },
        getRepoConfig: async () => REPO_CONFIG,
      });

      expect(count).to.equal(0);
      let images = 0;
      readOnly.view.state.doc.descendants((node) => {
        if (node.type.name === 'image') images += 1;
      });
      expect(images).to.equal(0);
    } finally {
      destroyEditor(readOnly);
    }
  });

  it('toasts the not-configured message when the repo config is null', async () => {
    const { view } = editor;
    view.posAtCoords = () => ({ pos: 1 });

    const count = await dropAssets(view, {
      assets: [{ id: 'a' }],
      coords: { left: 10, top: 10 },
      getRepoConfig: async () => null,
    });

    expect(count).to.equal(0);
    expect(toasts).to.have.length(1);
    expect(toasts[0].text).to.equal('AEM Assets is not configured for this site.');
  });

  it('inserts valid nodes and shows exactly one error toast for a mixed drop', async () => {
    const good = { id: 'good' };
    const bad = { id: 'bad' };
    const missing = { id: 'missing' };
    setSelectionFor(good, { href: 'https://example.com/good.png', isImage: true, alt: 'G' });
    setSelectionFor(bad, { error: DM_ERROR_MSG });
    setSelectionFor(missing, { error: MISSING_FORMAT_ERROR_MSG });

    const { view } = editor;
    view.posAtCoords = () => ({ pos: 1 });

    const count = await dropAssets(view, {
      assets: [good, bad, missing],
      coords: { left: 10, top: 10 },
      getRepoConfig: async () => REPO_CONFIG,
    });

    expect(count).to.equal(1);
    expect(toasts).to.have.length(1);
    expect(toasts[0].text).to.equal(DM_ERROR_MSG);

    let images = 0;
    view.state.doc.descendants((node) => {
      if (node.type.name === 'image') images += 1;
    });
    expect(images).to.equal(1);
  });

  it('computes the drop position after a doc change during getRepoConfig', async () => {
    const asset = { id: 'a' };
    setSelectionFor(asset, { href: 'https://example.com/a.png', isImage: true, alt: 'A' });

    const { view } = editor;
    const calls = [];
    view.posAtCoords = (coords) => {
      calls.push(coords);
      return { pos: 1 };
    };

    let resolveConfig;
    const configPromise = new Promise((resolve) => { resolveConfig = resolve; });

    const dropPromise = dropAssets(view, {
      assets: [asset],
      coords: { left: 10, top: 10 },
      getRepoConfig: () => configPromise,
    });

    // simulate a doc change arriving while getRepoConfig is still pending
    const { tr } = view.state;
    view.dispatch(tr.insertText('x', 0));
    expect(calls).to.have.length(0);

    resolveConfig(REPO_CONFIG);
    await dropPromise;

    expect(calls).to.have.length(1);
  });

  it('keeps the document valid when dropping at a block boundary', async () => {
    const asset = { id: 'a' };
    setSelectionFor(asset, { href: 'https://example.com/a.png', isImage: true, alt: 'A' });

    const { view } = editor;
    const boundaryPos = view.state.doc.content.size;
    view.posAtCoords = () => ({ pos: boundaryPos });

    await dropAssets(view, {
      assets: [asset],
      coords: { left: 10, top: 10 },
      getRepoConfig: async () => REPO_CONFIG,
    });

    expect(() => view.state.doc.check()).to.not.throw();

    let parentIsParagraph = false;
    view.state.doc.descendants((node, pos, parent) => {
      if (node.type.name === 'image') parentIsParagraph = parent.type.name === 'paragraph';
    });
    expect(parentIsParagraph).to.equal(true);
  });
});

describe('imageDrop integration', () => {
  let editor;
  let orgFetch;

  beforeEach(async () => {
    editor = await createTestEditor({ additionalPlugins: [imageDrop(null, () => 'https://admin.da.live/source/org/site/doc.html')] });
    await nextFrame();
    orgFetch = window.fetch;
  });

  afterEach(() => {
    window.fetch = orgFetch;
    destroyEditor(editor);
  });

  it('inserts an asset and makes no upload fetch on an asset drop', async () => {
    setRepositoryConfig(REPO_CONFIG);
    const asset = { id: 'a' };
    setSelectionFor(asset, { href: 'https://example.com/a.png', isImage: true, alt: 'A' });

    let fetchCalled = false;
    window.fetch = async () => {
      fetchCalled = true;
      return new Response('', { status: 200 });
    };

    const { view } = editor;
    view.posAtCoords = () => ({ pos: 1 });
    const dt = dataTransferWithAssets([asset]);
    const event = new DragEvent('drop', { dataTransfer: dt, clientX: 5, clientY: 5, cancelable: true });
    const defaultNotPrevented = view.dom.dispatchEvent(event);

    expect(defaultNotPrevented).to.equal(false); // preventDefault() was called
    await nextFrame();
    await nextFrame();

    let images = 0;
    view.state.doc.descendants((node) => {
      if (node.type.name === 'image') images += 1;
    });
    expect(images).to.equal(1);
    expect(fetchCalled).to.equal(false);
  });

  it('still uploads on a plain file drop', async () => {
    const calls = [];
    window.fetch = async (url, opts) => {
      const href = typeof url === 'string' ? url : url.url;
      calls.push({ url: href, opts });
      if (href.includes('/ping/')) return new Response('', { status: 200 });
      return new Response(
        JSON.stringify({ source: { contentUrl: 'https://content.da.live/org/site/.doc/pic.png' } }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    };

    const { view } = editor;
    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const event = new DragEvent('drop', { dataTransfer: dt, clientX: 5, clientY: 5, cancelable: true });
    view.dom.dispatchEvent(event);

    const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
    for (let i = 0; i < 50 && !calls.some((c) => c.opts?.method === 'POST'); i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await wait(20);
    }

    const upload = calls.find((c) => c.opts?.method === 'POST');
    expect(upload, 'nothing was uploaded').to.exist;
  });
});
