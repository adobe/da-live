import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

const { setNx, getNx, getNx2 } = await import('../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { setImsResult, handleSignInCalls } = await import(`${getNx()}/utils/ims.js`);
const { setRepositoryConfig } = await import(`${getNx2()}/utils/aem-assets/repository-config.js`);
const { selectorLoadCalls, setSelectorLoadResult } = await import(`${getNx2()}/utils/aem-assets/selector.js`);
const { setSelection, resetSelections, selectionCalls } = await import(`${getNx2()}/utils/aem-assets/selection.js`);
const { default: imageDrop } = await import('../../../../../blocks/canvas/ew-editor-doc/prose-plugins/imageDrop.js');

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

  it('bridges selector metadata through nested shadow roots into the document editor', async () => {
    editor = await createTestEditor({ additionalPlugins: [imageDrop(null, () => 'https://admin.da.live/source/org/site/doc.html')] });
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
    expect(props.iframe_dragEnd({ mouse: { x: 10, y: 20 } })).to.equal(true);
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(position.firstCall.args[0]).to.deep.equal({ left: 30, top: 60 });
    expect(selectionCalls[0].asset).to.include({
      name: 'image.png',
      path: '/content/dam/image.png',
      mimetype: 'image/png',
      'repo:id': 'asset',
      'aem:formatName': 'original',
    });
    let images = 0;
    editor.view.state.doc.descendants((node) => { if (node.type.name === 'image') images += 1; });
    expect(images).to.equal(1);
  });

  it('routes a preview drop through the existing image replacement channel', async () => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    nodes.push(iframe);
    sinon.stub(document, 'elementFromPoint').returns(iframe);
    sinon.stub(iframe, 'getBoundingClientRect').returns({ left: 25, top: 45 });
    const port = { postMessage: sinon.spy() };
    await renderAssetsRail({ container: createSource(), org: 'org', site: 'site', getPreview: () => ({ iframe, port }) });
    const asset = { name: 'image.png', path: '/image.png', mimetype: 'image/png' };
    const [{ props }] = renderCalls;
    props.iframe_dragStart({ assets: [asset] });
    expect(props.iframe_dragEnd({ assets: [asset], mouse: { x: 10, y: 20 } })).to.equal(true);
    expect(port.postMessage.firstCall.args[0]).to.deep.equal({
      type: 'image-replace',
      payload: { assets: [asset], x: 5, y: 15 },
    });
  });

  it('shows an asset preview that follows the pointer and clears on drag end', async () => {
    sinon.stub(document, 'elementFromPoint').returns(null);
    await renderAssetsRail({ container: createSource(), org: 'org', site: 'site' });
    const [{ props }] = renderCalls;
    props.iframe_dragStart({
      assets: [{ name: 'image.png' }],
      dataUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
      mouse: { x: 10, y: 20 },
    });
    const layer = document.querySelector('.assets-rail-drag-layer');
    expect(layer).to.not.equal(null);
    const ghost = layer.shadowRoot.querySelector('.assets-rail-drag-preview');
    expect(ghost.textContent).to.include('image.png');
    expect(ghost.querySelector('img')).to.not.equal(null);
    expect(ghost.style.transform).to.equal('translate(42px, 72px)');
    props.iframe_dragMove({ mouse: { x: 20, y: 30 } });
    expect(ghost.style.transform).to.equal('translate(52px, 82px)');

    props.iframe_dragEnd({ mouse: { x: 20, y: 30 } });
    expect(layer.isConnected).to.equal(false);
  });

  it('clears drag feedback on Escape and ignores a late drag-end callback', async () => {
    const hit = sinon.stub(document, 'elementFromPoint').returns(null);
    await renderAssetsRail({ container: createSource(), org: 'org', site: 'site' });
    const [{ props }] = renderCalls;
    props.iframe_dragStart({ assets: [{ name: 'image.png' }], mouse: { x: 10, y: 20 } });
    const layer = document.querySelector('.assets-rail-drag-layer');
    expect(layer).to.not.equal(null);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(layer.isConnected).to.equal(false);
    expect(props.iframe_dragEnd({ mouse: { x: 10, y: 20 } })).to.equal(false);
    expect(hit.called).to.equal(false);
  });

  it('delivers native and pointer preview drops once per gesture through a real port', async () => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:25px;top:45px;width:200px;height:150px;border:0';
    document.body.append(iframe);
    nodes.push(iframe);
    const channel = new MessageChannel();
    const messages = [];
    channel.port2.onmessage = ({ data }) => messages.push(data);
    try {
      await renderAssetsRail({
        container: createSource(),
        org: 'org',
        site: 'site',
        getPreview: () => ({ iframe, port: channel.port1 }),
      });
      const asset = { name: 'image.png', path: '/image.png', mimetype: 'image/png' };
      const [{ props }] = renderCalls;
      props.iframe_dragStart({ assets: [asset], mouse: { x: 10, y: 20 } });
      const layer = document.querySelector('.assets-rail-drag-layer');
      expect(layer).to.not.equal(null);
      const css = await (await fetch('/blocks/canvas/ew-canvas-assets/ew-canvas-assets.css')).text();
      layer.shadowRoot.adoptedStyleSheets[0].replaceSync(css);
      const shield = layer.shadowRoot.querySelector('.assets-rail-preview-shield');
      expect(document.elementFromPoint(35, 60)).to.equal(layer);
      expect(layer.shadowRoot.elementFromPoint(35, 60)).to.equal(shield);
      expect(getComputedStyle(layer).pointerEvents).to.equal('none');
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('collectionviewdata', '');
      const dragover = new DragEvent('dragover', { cancelable: true, dataTransfer });
      shield.dispatchEvent(dragover);
      expect(dragover.defaultPrevented).to.equal(true);
      const drop = new DragEvent('drop', { cancelable: true, dataTransfer, clientX: 35, clientY: 60 });
      shield.dispatchEvent(drop);
      expect(drop.defaultPrevented).to.equal(true);
      expect(layer.isConnected).to.equal(false);
      expect(props.iframe_dragEnd({ assets: [asset], mouse: { x: 15, y: 20 } })).to.equal(false);
      await new Promise((resolve) => { setTimeout(resolve, 0); });
      await new Promise((resolve) => { setTimeout(resolve, 0); });
      expect(messages).to.deep.equal([{
        type: 'image-replace',
        payload: { assets: [asset], x: 10, y: 15 },
      }]);

      props.iframe_dragStart({ assets: [asset], mouse: { x: 10, y: 20 } });
      const pointerShield = document.querySelector('.assets-rail-drag-layer')
        .shadowRoot.querySelector('.assets-rail-preview-shield');
      pointerShield.dispatchEvent(new PointerEvent('pointerup', { cancelable: true, clientX: 35, clientY: 60 }));
      expect(props.iframe_dragEnd({ assets: [asset], mouse: { x: 15, y: 20 } })).to.equal(false);
      await new Promise((resolve) => { setTimeout(resolve, 0); });
      await new Promise((resolve) => { setTimeout(resolve, 0); });
      expect(messages).to.have.length(2);
      expect(messages[1]).to.deep.equal(messages[0]);
    } finally {
      channel.port1.close();
      channel.port2.close();
    }
  });

  it('does not bridge a drop into a read-only document', async () => {
    editor = await createTestEditor({ editable: false });
    sinon.stub(document, 'elementFromPoint').returns(editor.view.dom);
    const drop = sinon.spy();
    editor.view.dom.addEventListener('drop', drop);
    await renderAssetsRail({ container: createSource(), org: 'org', site: 'site' });
    const [{ props }] = renderCalls;

    expect(props.iframe_dragEnd({ assets: [{ name: 'image.png' }], mouse: { x: 10, y: 20 } })).to.equal(false);
    expect(drop.called).to.equal(false);
  });

  it('ignores malformed callbacks, unrelated targets, and drops after the panel disconnects', async () => {
    let live = true;
    const port = { postMessage: sinon.spy() };
    const target = document.createElement('p');
    sinon.stub(document, 'elementFromPoint').returns(target);
    await renderAssetsRail({
      container: createSource(),
      org: 'org',
      site: 'site',
      isLive: () => live,
      getPreview: () => ({ iframe: target, port }),
    });
    const [{ props }] = renderCalls;
    const assets = [{ name: 'image.png' }];
    expect(props.iframe_dragEnd()).to.equal(false);
    expect(props.iframe_dragEnd({ assets: [null], mouse: { x: 1, y: 2 } })).to.equal(false);
    expect(props.iframe_dragEnd({ assets, mouse: { x: 1, y: 2 } })).to.equal(false);
    live = false;
    expect(props.iframe_dragEnd({ assets, mouse: { x: 1, y: 2 } })).to.equal(false);
    expect(port.postMessage.called).to.equal(false);
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

  it('removes active drag feedback when the rail disconnects', async () => {
    inst = await createInstance({ org: 'org', site: 'site' });
    renderCalls[0].props.iframe_dragStart({ assets: [{ name: 'image.png' }] });
    const layer = document.querySelector('.assets-rail-drag-layer');
    expect(layer).to.not.equal(null);
    inst.remove();
    expect(layer.isConnected).to.equal(false);
  });

  it('uses the preview port replayed when the rail opens after the preview', async () => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    sinon.stub(document, 'elementFromPoint').returns(iframe);
    sinon.stub(iframe, 'getBoundingClientRect').returns({ left: 25, top: 45, width: 200, height: 150 });
    const channel = new MessageChannel();
    const received = new Promise((resolve) => {
      channel.port2.onmessage = ({ data }) => resolve(data);
    });
    try {
      canvasBus.wysiwygPortReady.emit({ iframe, port: channel.port1 });
      inst = await createInstance({ org: 'org', site: 'site' });
      inst.shadowRoot.querySelector('.assets-rail').append(document.createElement('iframe'));
      const [{ props }] = renderCalls;
      const asset = { name: 'image.png', path: '/image.png', mimetype: 'image/png' };
      props.iframe_dragStart({ assets: [asset], mouse: { x: 10, y: 20 } });
      const shield = document.querySelector('.assets-rail-drag-layer')
        .shadowRoot.querySelector('.assets-rail-preview-shield');
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('collectionviewdata', '');
      shield.dispatchEvent(new DragEvent('drop', { cancelable: true, dataTransfer, clientX: 35, clientY: 60 }));
      expect(await received).to.deep.equal({
        type: 'image-replace',
        payload: { assets: [asset], x: 10, y: 15 },
      });
    } finally {
      inst?._destroyDrag?.();
      iframe.remove();
      channel.port1.close();
      channel.port2.close();
      canvasBus.wysiwygPortReady.emit(null);
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
