import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

const { setNx, getNx, getNx2 } = await import('../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { setImsResult, handleSignInCalls } = await import(`${getNx()}/utils/ims.js`);
const { setRepositoryConfig } = await import(`${getNx2()}/utils/aem-assets/repository-config.js`);
const { selectorLoadCalls, setSelectorLoadResult } = await import(`${getNx2()}/utils/aem-assets/selector.js`);
const { setSelection, resetSelections, selectionCalls } = await import(`${getNx2()}/utils/aem-assets/selection.js`);
const { createExtensionsBridgePlugin } = await import('../../../../../blocks/canvas/editor-utils/extensions-bridge.js');
const { getImageDocumentVersion } = await import(`${getNx2()}/public/utils/quick-edit-images.js`);

const { canvasBus } = await import('../../../../../blocks/canvas/utils/canvas-bus.js');

const {
  renderAssetsRail,
  NOT_CONFIGURED_ERROR,
  SIGN_IN_ERROR,
} = await import('../../../../../blocks/canvas/ew-canvas-assets/ew-canvas-assets.js');

const REPO_CONFIG = {
  repositoryId: 'author-p1-e1.adobeaemcloud.com',
  tierType: 'author',
};

function setup() {
  setImsResult({ accessToken: { token: 'test-token' } });
  setRepositoryConfig(REPO_CONFIG);
  setSelectorLoadResult(undefined);
  selectorLoadCalls.length = 0;
  handleSignInCalls.length = 0;
}

function teardown() {
  setImsResult(undefined);
  setRepositoryConfig(null);
  setSelectorLoadResult(undefined);
  selectorLoadCalls.length = 0;
  handleSignInCalls.length = 0;
}

describe('renderAssetsRail', () => {
  let renderCalls;
  let orgRenderAssetSelector;
  let editor;
  let nodes;

  beforeEach(() => {
    setup();
    renderCalls = [];
    nodes = [];
    orgRenderAssetSelector = window.PureJSSelectors?.renderAssetSelector;
    window.PureJSSelectors = {
      ...window.PureJSSelectors,
      renderAssetSelector: (el, props) => renderCalls.push({ el, props }),
    };
  });

  afterEach(() => {
    destroyEditor(editor);
    editor = undefined;
    nodes.forEach((node) => node.remove());
    sinon.restore();
    resetSelections();
    teardown();
    window.PureJSSelectors.renderAssetSelector = orgRenderAssetSelector;
  });

  it('renders the selector in rail mode', async () => {
    const container = document.createElement('div');
    const result = await renderAssetsRail({ container, org: 'org', site: 'site' });

    expect(result).to.deep.equal({ token: 'test-token' });
    expect(renderCalls).to.have.length(1);
    const [{ el, props }] = renderCalls;
    expect(el).to.equal(container);
    expect(props.rail).to.equal(true);
    expect(props.dragAndDrop).to.equal(true);
    expect(props.acvConfig.dragOptions.iframe).to.equal(true);
    expect(props.imsToken).to.equal('test-token');
    expect(props).to.not.have.property('handleSelection');
  });

  it('returns an error when the site has no repository', async () => {
    setRepositoryConfig(null);
    const container = document.createElement('div');
    const result = await renderAssetsRail({ container, org: 'org', site: 'site' });

    expect(result).to.deep.equal({ error: NOT_CONFIGURED_ERROR });
    expect(renderCalls).to.have.length(0);
  });

  it('returns the loader error when the selector script fails', async () => {
    const loaderError = 'The AEM Assets selector could not be loaded.';
    setSelectorLoadResult({ error: loaderError });
    const container = document.createElement('div');
    const result = await renderAssetsRail({ container, org: 'org', site: 'site' });

    expect(result).to.deep.equal({ error: loaderError });
    expect(renderCalls).to.have.length(0);
  });

  it('signs in and returns an error when the user is anonymous', async () => {
    setImsResult({ anonymous: true });
    const container = document.createElement('div');
    const result = await renderAssetsRail({ container, org: 'org', site: 'site' });

    expect(result).to.deep.equal({ error: SIGN_IN_ERROR });
    expect(handleSignInCalls).to.have.length(1);
    expect(renderCalls).to.have.length(0);
  });

  function createSource() {
    const container = document.createElement('div');
    const iframe = document.createElement('iframe');
    container.append(iframe);
    document.body.append(container);
    nodes.push(container);
    sinon.stub(iframe, 'getBoundingClientRect').returns({ left: 20, top: 40 });
    return container;
  }

  const findOverlay = () => [...document.body.children]
    .find((el) => el.style.zIndex === '2147483646');
  const settle = async () => {
    for (let i = 0; i < 6; i += 1) await new Promise((r) => { setTimeout(r, 0); });
  };
  const countImages = (view) => {
    let images = 0;
    view.state.doc.descendants((node) => { if (node.type.name === 'image') images += 1; });
    return images;
  };
  const railEditor = (opts = {}) => createTestEditor({
    ...opts,
    additionalPlugins: [createExtensionsBridgePlugin()],
  });

  function createPreview() {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:25px;top:45px;width:200px;height:150px;border:0';
    document.body.append(iframe);
    nodes.push(iframe);
    const channel = new MessageChannel();
    const messages = [];
    channel.port2.onmessage = ({ data }) => messages.push(data);
    canvasBus.wysiwygPortReady.emit({ iframe, port: channel.port1 });
    const close = () => {
      canvasBus.wysiwygPortReady.emit(null);
      channel.port1.close();
      channel.port2.close();
    };
    return { iframe, port: channel.port2, messages, close };
  }

  it('drops selector assets through nested shadow roots into the document editor', async () => {
    editor = await railEditor();
    const host = document.createElement('div');
    const nested = document.createElement('div');
    host.attachShadow({ mode: 'open' }).append(nested);
    nested.attachShadow({ mode: 'open' }).append(editor.view.dom.parentElement);
    document.body.append(host);
    nodes.push(host);
    const target = editor.view.dom.querySelector('p');
    sinon.stub(document, 'elementFromPoint').returns(host);
    sinon.stub(host.shadowRoot, 'elementFromPoint').returns(nested);
    sinon.stub(nested.shadowRoot, 'elementFromPoint').returns(target);
    const position = sinon.stub(editor.view, 'posAtCoords').returns({ pos: 1 });
    setSelection({ href: 'https://example.com/image.png', isImage: true });

    await renderAssetsRail({ container: createSource(), org: 'org', site: 'site' });
    const [{ props }] = renderCalls;
    const asset = {
      __original: {
        'repo:id': 'asset',
        'repo:name': 'image.png',
        'repo:path': '/content/dam/image.png',
        'dc:format': 'image/png',
        'aem:formatName': 'original',
      },
    };
    props.iframe_dragStart({ assets: [asset] });
    props.iframe_dragMove({ mouse: { x: 10, y: 20 } });
    props.iframe_dragEnd({ mouse: { x: 10, y: 20 } });
    await settle();

    expect(position.firstCall.args[0]).to.deep.equal({ left: 30, top: 60 });
    expect(selectionCalls[0].asset).to.include({
      name: 'image.png',
      path: '/content/dam/image.png',
      mimetype: 'image/png',
      'repo:id': 'asset',
      'aem:formatName': 'original',
    });
    expect(countImages(editor.view)).to.equal(1);
    expect(findOverlay()).to.equal(undefined);
  });

  it('replaces a preview image through the drop-target resolve handshake', async () => {
    editor = await railEditor();
    const { state } = editor.view;
    const img = state.schema.nodes.image.create({ src: '/old.png', alt: 'Original alt' });
    const para = state.schema.nodes.paragraph.create(null, img);
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, para));
    let imagePos;
    editor.view.state.doc.descendants((node, pos) => { if (node.type.name === 'image') imagePos = pos; });
    setSelection({ href: 'https://example.com/new.png', isImage: true });

    const preview = createPreview();
    sinon.stub(document, 'elementFromPoint').returns(preview.iframe);
    preview.port.addEventListener('message', ({ data }) => {
      if (data.payload?.phase !== 'resolve') return;
      const { doc } = editor.view.state;
      preview.port.postMessage({
        type: 'drop-target',
        payload: {
          requestId: data.payload.requestId,
          documentVersion: getImageDocumentVersion(doc),
          target: { proseIndex: imagePos, imageVersion: getImageDocumentVersion(doc), originalSrc: '/old.png' },
        },
      });
    });
    const metadata = { name: 'image.png', path: '/image.png', mimetype: 'image/png', 'repo:id': 'asset' };
    const callbacks = { onSelect: () => {}, details: { render: () => {} } };
    const asset = { __original: { ...metadata, ...callbacks } };
    try {
      await renderAssetsRail({ container: createSource(), org: 'org', site: 'site' });
      const [{ props }] = renderCalls;
      props.iframe_dragStart({ assets: [asset] });
      props.iframe_dragEnd({ mouse: { x: 10, y: 20 } });
      await settle();

      const resolve = preview.messages.find((m) => m.payload?.phase === 'resolve');
      expect(resolve.type).to.equal('drop-target');
      expect(resolve.payload).to.include({ kind: 'image', x: 5, y: 15 });
      expect(preview.messages.some((m) => m.type === 'image-replace')).to.equal(false);
      expect(selectionCalls[0].asset).to.include(metadata);
      expect(editor.view.state.doc.nodeAt(imagePos).attrs)
        .to.include({ src: 'https://example.com/new.png', alt: 'Original alt' });
    } finally {
      preview.close();
    }
  });

  it('shows only a thumbnail that follows the pointer and clears on drag end', async () => {
    editor = await railEditor();
    sinon.stub(document, 'elementFromPoint').returns(null);
    await renderAssetsRail({ container: createSource(), org: 'org', site: 'site' });
    const [{ props }] = renderCalls;
    props.iframe_dragStart({
      assets: [{ name: 'image.png' }],
      dataUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
      mouse: { x: 10, y: 20 },
    });
    const overlay = findOverlay();
    expect(overlay).to.not.equal(undefined);
    expect(overlay.children).to.have.length(1);
    const ghost = overlay.querySelector('img');
    expect(ghost.style.pointerEvents).to.equal('none');
    expect(ghost.style.transform).to.equal('translate(42px, 72px)');
    props.iframe_dragMove({ mouse: { x: 20, y: 30 } });
    expect(ghost.style.transform).to.equal('translate(52px, 82px)');

    props.iframe_dragEnd({ mouse: { x: 20, y: 30 } });
    await settle();
    expect(overlay.isConnected).to.equal(false);
  });

  it('bridges preview hover, leave, and cancellation without resolving a target', async () => {
    editor = await railEditor();
    const preview = createPreview();
    sinon.stub(document, 'elementFromPoint').callsFake((x, y) => (
      x >= 25 && x < 225 && y >= 45 && y < 195 ? preview.iframe : null));
    sinon.stub(window, 'requestAnimationFrame').callsFake((cb) => {
      cb();
      return 0;
    });
    try {
      await renderAssetsRail({ container: createSource(), org: 'org', site: 'site' });
      const [{ props }] = renderCalls;
      props.iframe_dragStart({ assets: [{ name: 'image.png' }], mouse: { x: 10, y: 20 } });
      props.iframe_dragMove({ mouse: { x: 300, y: 300 } });
      props.iframe_dragMove({ mouse: { x: 15, y: 25 } });
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(findOverlay()).to.equal(undefined);
      props.iframe_dragEnd({ mouse: { x: 15, y: 25 } });
      await settle();

      expect(preview.messages).to.deep.equal([
        { type: 'drop-target', payload: { phase: 'hover', kind: 'image', x: 5, y: 15 } },
        { type: 'drop-target', payload: { phase: 'leave' } },
        { type: 'drop-target', payload: { phase: 'hover', kind: 'image', x: 10, y: 20 } },
        { type: 'drop-target', payload: { phase: 'leave' } },
      ]);
    } finally {
      preview.close();
    }
  });

  it('finishes a native drop on the overlay once and ignores the late drag-end callback', async () => {
    editor = await railEditor();
    document.body.append(editor.view.dom.parentElement);
    nodes.push(editor.view.dom.parentElement);
    sinon.stub(document, 'elementFromPoint').returns(editor.view.dom.querySelector('p'));
    sinon.stub(editor.view, 'posAtCoords').returns({ pos: 1 });
    setSelection({ href: 'https://example.com/image.png', isImage: true });
    await renderAssetsRail({ container: createSource(), org: 'org', site: 'site' });
    const [{ props }] = renderCalls;
    props.iframe_dragStart({ assets: [{ name: 'image.png', path: '/image.png', mimetype: 'image/png' }] });
    const overlay = findOverlay();
    const dragover = new DragEvent('dragover', { cancelable: true, dataTransfer: new DataTransfer() });
    overlay.dispatchEvent(dragover);
    expect(dragover.defaultPrevented).to.equal(true);
    const drop = new DragEvent('drop', { cancelable: true, clientX: 30, clientY: 60 });
    overlay.dispatchEvent(drop);
    expect(drop.defaultPrevented).to.equal(true);
    props.iframe_dragEnd({ mouse: { x: 10, y: 20 } });
    await settle();

    expect(overlay.isConnected).to.equal(false);
    expect(selectionCalls).to.have.length(1);
    expect(countImages(editor.view)).to.equal(1);
  });

  it('does not start a drag over a read-only document', async () => {
    editor = await railEditor({ editable: false });
    await renderAssetsRail({ container: createSource(), org: 'org', site: 'site' });
    const [{ props }] = renderCalls;
    props.iframe_dragStart({ assets: [{ name: 'image.png' }], mouse: { x: 10, y: 20 } });
    expect(findOverlay()).to.equal(undefined);
    props.iframe_dragEnd({ mouse: { x: 10, y: 20 } });
    await settle();
    expect(countImages(editor.view)).to.equal(0);
  });

  it('ignores malformed callbacks and drags after the panel disconnects', async () => {
    editor = await railEditor();
    let live = true;
    const hit = sinon.stub(document, 'elementFromPoint').returns(null);
    const container = createSource();
    await renderAssetsRail({ container, org: 'org', site: 'site', isLive: () => live });
    const [{ props }] = renderCalls;
    props.iframe_dragStart();
    props.iframe_dragStart({ assets: [null], mouse: { x: 1, y: 2 } });
    props.iframe_dragStart({ assets: [], mouse: { x: 1, y: 2 } });
    expect(findOverlay()).to.equal(undefined);
    live = false;
    props.iframe_dragStart({ assets: [{ name: 'image.png' }], mouse: { x: 1, y: 2 } });
    expect(findOverlay()).to.equal(undefined);
    props.iframe_dragMove({ mouse: { x: 1, y: 2 } });
    props.iframe_dragEnd({ mouse: { x: 1, y: 2 } });
    await settle();
    expect(hit.called).to.equal(false);
    expect(selectionCalls).to.have.length(0);
  });
});

describe('ew-canvas-assets element', () => {
  let renderCalls;
  let orgRenderAssetSelector;
  let inst;

  beforeEach(() => {
    setup();
    renderCalls = [];
    orgRenderAssetSelector = window.PureJSSelectors?.renderAssetSelector;
    window.PureJSSelectors = {
      ...window.PureJSSelectors,
      renderAssetSelector: (el, props) => renderCalls.push({ el, props }),
    };
  });

  afterEach(() => {
    sinon.restore();
    teardown();
    window.PureJSSelectors.renderAssetSelector = orgRenderAssetSelector;
    inst?.remove();
    canvasBus.toolPanelViewState.emit(null);
  });

  async function createInstance(props = {}) {
    const el = document.createElement('ew-canvas-assets');
    Object.assign(el, props);
    document.body.append(el);
    await el.updateComplete;
    // Let the async renderAssetsRail() call inside firstUpdated settle.
    await new Promise((r) => { setTimeout(r, 0); });
    await el.updateComplete;
    return el;
  }

  it('renders the selector once across hide/show', async () => {
    inst = await createInstance({ org: 'org', site: 'site' });
    expect(renderCalls).to.have.length(1);

    inst.hidden = true;
    await inst.updateComplete;
    inst.hidden = false;
    await inst.updateComplete;
    expect(renderCalls).to.have.length(1);

    const { parentNode } = inst;
    inst.remove();
    parentNode.append(inst);
    await inst.updateComplete;
    expect(renderCalls).to.have.length(1);
  });

  const findOverlay = () => [...document.body.children]
    .find((el) => el.style.zIndex === '2147483646');

  it('removes active drag feedback when the rail disconnects', async () => {
    const editor = await createTestEditor({ additionalPlugins: [createExtensionsBridgePlugin()] });
    try {
      inst = await createInstance({ org: 'org', site: 'site' });
      renderCalls[0].props.iframe_dragStart({ assets: [{ name: 'image.png' }] });
      const overlay = findOverlay();
      expect(overlay).to.not.equal(undefined);
      inst.remove();
      expect(overlay.isConnected).to.equal(false);
    } finally {
      destroyEditor(editor);
    }
  });

  it('uses the preview port published before the rail opens', async () => {
    const editor = await createTestEditor({ additionalPlugins: [createExtensionsBridgePlugin()] });
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:25px;top:45px;width:200px;height:150px;border:0';
    document.body.append(iframe);
    sinon.stub(document, 'elementFromPoint').returns(iframe);
    const channel = new MessageChannel();
    const received = new Promise((resolve) => {
      channel.port2.onmessage = ({ data }) => {
        if (data.payload?.phase === 'resolve') resolve(data);
      };
    });
    try {
      canvasBus.wysiwygPortReady.emit({ iframe, port: channel.port1 });
      inst = await createInstance({ org: 'org', site: 'site' });
      const railFrame = document.createElement('iframe');
      inst.shadowRoot.querySelector('.assets-rail').append(railFrame);
      sinon.stub(railFrame, 'getBoundingClientRect').returns({ left: 20, top: 40 });
      const [{ props }] = renderCalls;
      const asset = { name: 'image.png', path: '/image.png', mimetype: 'image/png' };
      props.iframe_dragStart({ assets: [asset], mouse: { x: 10, y: 20 } });
      props.iframe_dragEnd({ mouse: { x: 15, y: 20 } });
      const { type, payload } = await received;
      expect(type).to.equal('drop-target');
      expect(payload).to.include({ phase: 'resolve', kind: 'image', x: 10, y: 15 });
    } finally {
      inst?._destroyDrag?.();
      iframe.remove();
      channel.port1.close();
      channel.port2.close();
      canvasBus.wysiwygPortReady.emit(null);
      destroyEditor(editor);
      sinon.restore();
    }
  });

  it('shows the error message', async () => {
    setRepositoryConfig(null);
    inst = await createInstance({ org: 'org', site: 'site' });
    const errorEl = inst.shadowRoot.querySelector('.assets-rail-error');
    expect(errorEl.textContent).to.equal(NOT_CONFIGURED_ERROR);
    const rail = inst.shadowRoot.querySelector('.assets-rail');
    expect(rail.hidden).to.equal(true);
  });

  it('re-renders when a new IMS token is seen while the panel is active', async () => {
    inst = await createInstance({ org: 'org', site: 'site' });
    expect(renderCalls).to.have.length(1);

    setImsResult({ accessToken: { token: 'rotated-token' } });
    const refresh = sinon.spy(inst, '_onViewState');
    canvasBus.toolPanelViewState.emit('aem-assets-panel');
    await refresh.firstCall.returnValue;

    expect(renderCalls).to.have.length(2);
    expect(renderCalls[1].props.imsToken).to.equal('rotated-token');
  });

  it('does not re-render when the token is unchanged', async () => {
    inst = await createInstance({ org: 'org', site: 'site' });
    expect(renderCalls).to.have.length(1);

    canvasBus.toolPanelViewState.emit('aem-assets-panel');
    await new Promise((r) => { setTimeout(r, 0); });

    expect(renderCalls).to.have.length(1);
  });

  it('ignores view-state updates for other panel ids', async () => {
    inst = await createInstance({ org: 'org', site: 'site' });
    expect(renderCalls).to.have.length(1);

    setImsResult({ accessToken: { token: 'rotated-token' } });
    canvasBus.toolPanelViewState.emit('comments');
    await new Promise((r) => { setTimeout(r, 0); });

    expect(renderCalls).to.have.length(1);
  });

  it('skips rendering when detached mid-render, and renders once on reconnect', async () => {
    let resolveRepo;
    const pendingRepo = new Promise((resolve) => { resolveRepo = resolve; });
    setRepositoryConfig(pendingRepo);

    const el = document.createElement('ew-canvas-assets');
    Object.assign(el, { org: 'org', site: 'site' });
    document.body.append(el);
    inst = el;
    await el.updateComplete;

    // Detach while renderAssetsRail is still awaiting the repo config.
    el.remove();
    resolveRepo(REPO_CONFIG);
    await new Promise((r) => { setTimeout(r, 0); });
    await new Promise((r) => { setTimeout(r, 0); });

    expect(renderCalls).to.have.length(0);

    document.body.append(el);
    await el.updateComplete;
    await new Promise((r) => { setTimeout(r, 0); });
    await el.updateComplete;

    expect(renderCalls).to.have.length(1);
  });
});
