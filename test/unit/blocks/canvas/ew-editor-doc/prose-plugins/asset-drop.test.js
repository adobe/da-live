import { expect } from '@esm-bundle/chai';
import { Fragment } from 'da-y-wrapper';
import { setNx, getNx2 } from '../../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let readDroppedAssets;
let buildAssetNodes;
let dropAssets;
let installAssetDropGuard;
let imageDrop;
let ASSET_DRAG_DATA_TYPE;
let DM_ERROR_MSG;
let PUBLISH_ERROR_MSG;
let MISSING_FORMAT_ERROR_MSG;
let setSelectionFor;
let resetSelections;
let setRepositoryConfig;
let toasts;

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

before(async () => {
  ({ readDroppedAssets, buildAssetNodes, dropAssets, installAssetDropGuard } = await import('../../../../../../blocks/canvas/ew-editor-doc/prose-plugins/assetDrop.js'));
  ({ default: imageDrop } = await import('../../../../../../blocks/canvas/ew-editor-doc/prose-plugins/imageDrop.js'));
  ({ ASSET_DRAG_DATA_TYPE } = await import(`${getNx2()}/utils/aem-assets/selector-props.js`));
  ({
    DM_ERROR_MSG,
    PUBLISH_ERROR_MSG,
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

  it('returns null for an empty array', () => {
    const dt = dataTransferWithAssets([]);
    expect(readDroppedAssets(dt)).to.equal(null);
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
    const { nodes, errors, rejected } = await buildAssetNodes(
      editor.view.state.schema,
      [assetA, assetB],
      REPO_CONFIG,
    );
    expect(nodes).to.deep.equal([]);
    expect(errors).to.deep.equal([DM_ERROR_MSG]);
    expect(rejected).to.equal(2);
  });

  it('does not count a missing-format asset as rejected', async () => {
    const asset = { id: 'bad-1' };
    setSelectionFor(asset, { error: MISSING_FORMAT_ERROR_MSG });
    const { rejected } = await buildAssetNodes(editor.view.state.schema, [asset], REPO_CONFIG);
    expect(rejected).to.equal(0);
  });

  it('keeps 3 consecutive PDF links separate after Fragment.fromArray', async () => {
    const pdfs = [{ id: 'pdf-1' }, { id: 'pdf-2' }, { id: 'pdf-3' }];
    setSelectionFor(pdfs[0], { href: 'https://example.com/1.pdf', isImage: false, alt: '' });
    setSelectionFor(pdfs[1], { href: 'https://example.com/2.pdf', isImage: false, alt: '' });
    setSelectionFor(pdfs[2], { href: 'https://example.com/3.pdf', isImage: false, alt: '' });

    const { nodes } = await buildAssetNodes(editor.view.state.schema, pdfs, REPO_CONFIG);
    const fragment = Fragment.fromArray(nodes);
    const hrefs = [];
    fragment.forEach((node) => {
      const link = node.marks.find((m) => m.type.name === 'link');
      if (link) hrefs.push(link.attrs.href);
    });
    expect(hrefs).to.deep.equal([
      'https://example.com/1.pdf',
      'https://example.com/2.pdf',
      'https://example.com/3.pdf',
    ]);
  });

  it('keeps the same PDF dropped twice as two separate links with correct text', async () => {
    const assetA = { id: 'pdf-same-a' };
    const assetB = { id: 'pdf-same-b' };
    setSelectionFor(assetA, { href: 'https://example.com/same.pdf', isImage: false, alt: '' });
    setSelectionFor(assetB, { href: 'https://example.com/same.pdf', isImage: false, alt: '' });

    const { nodes } = await buildAssetNodes(
      editor.view.state.schema,
      [assetA, assetB],
      REPO_CONFIG,
    );
    const fragment = Fragment.fromArray(nodes);
    const links = [];
    fragment.forEach((node) => {
      const link = node.marks.find((m) => m.type.name === 'link');
      if (link) links.push({ text: node.text, href: link.attrs.href });
    });
    expect(links).to.have.length(2);
    links.forEach((link) => expect(link.text).to.equal(link.href));
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

  it('resolves to 0 and shows exactly one error toast when getRepoConfig rejects', async () => {
    const asset = { id: 'a' };
    setSelectionFor(asset, { href: 'https://example.com/a.png', isImage: true, alt: 'A' });

    const { view } = editor;
    view.posAtCoords = () => ({ pos: 1 });
    const docBefore = view.state.doc.toString();

    const orgConsoleError = console.error;
    const consoleErrors = [];
    console.error = (...args) => consoleErrors.push(args);

    let count;
    try {
      count = await dropAssets(view, {
        assets: [asset],
        coords: { left: 10, top: 10 },
        getRepoConfig: async () => { throw new Error('network failure'); },
      });
    } finally {
      console.error = orgConsoleError;
    }

    expect(count).to.equal(0);
    expect(toasts).to.have.length(1);
    expect(toasts[0].text).to.equal('The assets could not be added. Please try again.');
    expect(view.state.doc.toString()).to.equal(docBefore);
    expect(consoleErrors).to.have.length(1);
    expect(consoleErrors[0][0]).to.equal('[asset-drop]');
  });

  it('resolves 0 without toasting or throwing when the view is destroyed while getRepoConfig is pending', async () => {
    const asset = { id: 'a' };
    setSelectionFor(asset, { href: 'https://example.com/a.png', isImage: true, alt: 'A' });

    const { view } = editor;
    view.posAtCoords = () => ({ pos: 1 });

    const count = await dropAssets(view, {
      assets: [asset],
      coords: { left: 10, top: 10 },
      getRepoConfig: async () => {
        destroyEditor(editor);
        return REPO_CONFIG;
      },
    });

    expect(count).to.equal(0);
    expect(toasts).to.have.length(0);
  });

  it('sets the selection right after the inserted fragment and focuses the view', async () => {
    const asset = { id: 'a' };
    setSelectionFor(asset, { href: 'https://example.com/a.png', isImage: true, alt: 'A' });

    const { view } = editor;
    const dropPos = 1;
    view.posAtCoords = () => ({ pos: dropPos });

    let focused = false;
    const orgFocus = view.focus.bind(view);
    view.focus = () => {
      focused = true;
      orgFocus();
    };

    const count = await dropAssets(view, {
      assets: [asset],
      coords: { left: 10, top: 10 },
      getRepoConfig: async () => REPO_CONFIG,
    });

    expect(count).to.equal(1);
    let fragmentSize;
    view.state.doc.descendants((node) => {
      if (node.type.name === 'image') fragmentSize = node.nodeSize;
    });
    expect(view.state.selection.head).to.equal(dropPos + fragmentSize);
    expect(focused).to.equal(true);
  });

  it('counts assets, not distinct messages, toward the skipped suffix', async () => {
    const dmA = { id: 'dm-a' };
    const dmB = { id: 'dm-b' };
    const published = { id: 'pub' };
    setSelectionFor(dmA, { error: DM_ERROR_MSG });
    setSelectionFor(dmB, { error: DM_ERROR_MSG });
    setSelectionFor(published, { error: PUBLISH_ERROR_MSG });

    const { view } = editor;
    view.posAtCoords = () => ({ pos: 1 });

    const count = await dropAssets(view, {
      assets: [dmA, dmB, published],
      coords: { left: 10, top: 10 },
      getRepoConfig: async () => REPO_CONFIG,
    });

    expect(count).to.equal(0);
    expect(toasts).to.have.length(1);
    expect(toasts[0].text).to.equal(`${DM_ERROR_MSG} (3 assets skipped)`);
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

  it('computes the drop position after a doc change during buildAssetNodes', async () => {
    // buildAssetNodes's own async work (its lazy module load) is already cached by the
    // time this test runs, so its forEach over resolveAssetSelection executes fully
    // synchronously -- but its promise is still *pending* for the whole duration from the
    // caller's point of view. A Proxy on the selection result lets us land a doc change
    // inside that synchronous stretch, which is functionally the same hazard described in
    // the bug report: a change that arrives before buildAssetNodes's returned promise
    // settles must still be visible to the position computed from it.
    const asset = { id: 'a' };
    const { view } = editor;

    let changed = false;
    let posComputedAfterChange = null;
    view.posAtCoords = () => {
      posComputedAfterChange = changed;
      return { pos: 1 };
    };

    const selection = { href: 'https://example.com/a.png', isImage: true, alt: 'A' };
    const proxiedSelection = new Proxy(selection, {
      get(target, prop, receiver) {
        if (prop === 'error' && !changed) {
          changed = true;
          // simulate a doc change (e.g. a collab edit) arriving while buildAssetNodes is
          // still doing its work
          const { tr } = view.state;
          view.dispatch(tr.insertText('x', 0));
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    setSelectionFor(asset, proxiedSelection);

    const count = await dropAssets(view, {
      assets: [asset],
      coords: { left: 10, top: 10 },
      getRepoConfig: async () => REPO_CONFIG,
    });

    expect(count).to.equal(1);
    expect(posComputedAfterChange).to.equal(true);
    expect(() => view.state.doc.check()).to.not.throw();
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

describe('installAssetDropGuard', () => {
  let plainDiv;
  let editor;

  beforeEach(async () => {
    plainDiv = document.createElement('div');
    document.body.appendChild(plainDiv);
    editor = await createTestEditor();
    await nextFrame();
    installAssetDropGuard();
  });

  afterEach(() => {
    plainDiv.remove();
    destroyEditor(editor);
  });

  function dragEventWithAssetType(type) {
    const dt = new DataTransfer();
    dt.setData(ASSET_DRAG_DATA_TYPE, '[]');
    if (type === 'drop') return new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
    return new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true });
  }

  it('prevents default for an asset drop outside the editor', () => {
    const dropEvent = dragEventWithAssetType('drop');
    const notPrevented = plainDiv.dispatchEvent(dropEvent);
    expect(notPrevented).to.equal(false);
  });

  it('prevents default for an asset dragover outside the editor', () => {
    const dragoverEvent = dragEventWithAssetType('dragover');
    const notPrevented = plainDiv.dispatchEvent(dragoverEvent);
    expect(notPrevented).to.equal(false);
  });

  it('does not prevent default for a drop without the asset drag type', () => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'https://example.com');
    const event = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
    const notPrevented = plainDiv.dispatchEvent(event);
    expect(notPrevented).to.equal(true);
  });

  it('does not prevent default for an asset drop inside the editor', () => {
    const event = dragEventWithAssetType('drop');
    const notPrevented = editor.view.dom.dispatchEvent(event);
    expect(notPrevented).to.equal(true);
  });

  it('does not double-register when installed twice', () => {
    installAssetDropGuard();
    const event = dragEventWithAssetType('drop');
    let preventDefaultCalls = 0;
    const orgPreventDefault = event.preventDefault.bind(event);
    event.preventDefault = () => {
      preventDefaultCalls += 1;
      orgPreventDefault();
    };
    plainDiv.dispatchEvent(event);
    expect(preventDefaultCalls).to.equal(1);
  });
});
