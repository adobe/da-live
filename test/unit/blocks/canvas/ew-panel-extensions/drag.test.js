import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx, getNx2 } from '../../../../../scripts/utils.js';
import { makeRealView } from '../test-helpers.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { createDragController } = await import('../../../../../blocks/canvas/ew-panel-extensions/drag.js');
const { getImageDocumentVersion } = await import(`${getNx2()}/public/utils/quick-edit-images.js`);

describe('extension SDK drag host', () => {
  let view;
  let iframe;
  let controller;
  let preview;
  let channel;
  let notify;
  const point = { x: 150, y: 180 };
  beforeEach(() => {
    view = makeRealView({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep' }] }] });
    iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:0;top:0;width:100px;height:100px;border:0';
    document.body.append(iframe);
    sinon.stub(view.dom, 'getBoundingClientRect').returns({ left: 100, right: 400, top: 100, bottom: 250 });
    sinon.stub(view.root, 'elementFromPoint').returns(view.dom.firstChild);
    sinon.stub(view, 'posAtCoords').returns({ pos: view.state.doc.content.size });
    notify = sinon.spy();
    controller = createDragController({
      iframe,
      getView: () => view,
      notify,
      context: { org: 'drag-org', site: 'site', path: 'dir/page' },
    });
  });
  afterEach(() => {
    controller.destroy();
    channel?.port1.close();
    channel?.port2.close();
    channel = undefined;
    preview?.remove();
    preview = undefined;
    canvasBus.wysiwygPortReady.emit(null);
    const mount = view.dom.parentElement;
    view.destroy();
    mount.remove();
    iframe.remove();
    sinon.restore();
  });
  const start = (payload = { data: { 'text/html': '<h2>Heading</h2>' } }) => controller.handle({ action: 'dragStart', details: { payload, point } });
  const finish = (dragId, release = point) => controller.handle({ action: 'dragFinish', details: { dragId, point: release } });
  const mockPreview = ({ stale = false, target = { anchor: { kind: 'text', index: 1 }, side: 'after' } } = {}) => {
    preview = document.createElement('iframe');
    preview.style.cssText = 'position:fixed;left:500px;top:100px;width:200px;height:200px;border:0';
    document.body.append(preview);
    channel = new MessageChannel();
    channel.port2.onmessage = ({ data }) => {
      if (data.type !== 'drop-target' || data.payload.phase !== 'resolve') return;
      channel.port2.postMessage({
        type: 'drop-target',
        payload: {
          requestId: data.payload.requestId,
          documentVersion: stale ? 'old' : getImageDocumentVersion(view.state.doc),
          target,
        },
      });
    };
    canvasBus.wysiwygPortReady.emit({ iframe: preview, port: channel.port1 });
  };
  it('inserts HTML at the document target once, not the current selection', async () => {
    const drag = await start();
    expect(drag.ok).to.equal(true);
    expect(await finish(drag.dragId)).to.deep.equal({ ok: true });
    expect(view.state.doc.textContent).to.equal('KeepHeading');
    expect(view.state.doc.lastChild.type.name).to.equal('heading');
    expect((await finish(drag.dragId)).ok).to.equal(false);
    expect(view.state.doc.textContent).to.equal('KeepHeading');
    expect(view.posAtCoords.calledWith({ left: 150, top: 180 })).to.equal(true);
  });
  it('cancels without inserting and rejects invalid, read-only, and outside-editor drops', async () => {
    expect((await start(null)).ok).to.equal(false);
    expect((await start({ files: [new File(['bad'], '../bad.png', { type: 'image/png' })] })).ok).to.equal(false);
    expect((await start({ data: { 'text/html': '' } })).ok).to.equal(false);
    const drag = await start();
    await controller.handle({ action: 'dragCancel', details: { dragId: drag.dragId } });
    expect((await finish(drag.dragId)).ok).to.equal(false);
    const outside = await start();
    expect((await finish(outside.dragId, { x: 800, y: 500 })).ok).to.equal(false);
    view.setProps({ editable: () => false });
    expect((await start()).ok).to.equal(false);
    expect(view.state.doc.textContent).to.equal('Keep');
  });
  it('resolves WYSIWYG boundaries over its port and rejects stale preview versions', async () => {
    mockPreview();
    const drag = await start();
    expect(await finish(drag.dragId, { x: 550, y: 150 })).to.deep.equal({ ok: true });
    expect(view.state.doc.textContent).to.equal('KeepHeading');
    channel.port1.close();
    channel.port2.close();
    preview.remove();
    mockPreview({ stale: true });
    const stale = await start();
    expect((await finish(stale.dragId, { x: 550, y: 150 })).ok).to.equal(false);
    expect(view.state.doc.textContent).to.equal('KeepHeading');
  });
  it('uploads image Files with precedence over HTML and inserts the returned image URL', async () => {
    const fetch = sinon.stub(window, 'fetch').callsFake(async (url) => {
      if (String(url).includes('/ping/')) return new Response('', { status: 200 });
      return new Response(JSON.stringify({ source: { contentUrl: './media_drag.png' } }), { status: 201, headers: { 'content-type': 'application/json' } });
    });
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    const drag = await start({ data: { 'text/html': '<p>Ignored</p>' }, files: [file] });
    expect(await finish(drag.dragId)).to.deep.equal({ ok: true });
    expect(view.state.doc.lastChild.firstChild.type.name).to.equal('image');
    expect(view.state.doc.lastChild.firstChild.attrs.src).to.equal('./media_drag.png');
    expect(view.state.doc.textContent).to.equal('Keep');
    expect(fetch.getCalls().some(({ args }) => String(args[0]).includes('/dir/.page/photo.png')))
      .to.equal(true);
  });
  it('does not insert an uploaded image after permission or document changes', async () => {
    sinon.stub(window, 'fetch').callsFake(async (url) => {
      if (String(url).includes('/ping/')) return new Response('', { status: 200 });
      view.setProps({ editable: () => false });
      return new Response(JSON.stringify({ source: { contentUrl: './media_cancelled.png' } }), { status: 201, headers: { 'content-type': 'application/json' } });
    });
    const drag = await start({ files: [new File(['image'], 'photo.png', { type: 'image/png' })] });
    expect((await finish(drag.dragId)).ok).to.equal(false);
    expect(view.state.doc.textContent).to.equal('Keep');
    expect(view.state.doc.childCount).to.equal(1);
  });
  it('finishes using parent overlay coordinates and removes the overlay after acknowledgement', async () => {
    iframe.style.left = '20px';
    iframe.style.top = '20px';
    const drag = await start();
    const layer = [...document.querySelectorAll('div')].find((div) => div.style.cursor === 'copy');
    layer.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientX: 170, clientY: 200 }));
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(view.posAtCoords.calledWith({ left: 170, top: 200 })).to.equal(true);
    expect(view.state.doc.textContent).to.equal('KeepHeading');
    expect(layer.isConnected).to.equal(false);
    expect(notify.calledOnceWithExactly({ dragId: drag.dragId, result: { ok: true } }))
      .to.equal(true);
    expect((await finish(drag.dragId)).ok).to.equal(false);
  });
  it('cancels pending preview resolution when the channel is destroyed', async () => {
    mockPreview();
    channel.port2.onmessage = () => {};
    const drag = await start();
    const result = finish(drag.dragId, { x: 550, y: 150 });
    controller.destroy();
    expect((await result).ok).to.equal(false);
    expect(view.state.doc.textContent).to.equal('Keep');
    expect(notify.calledOnceWithExactly({ dragId: drag.dragId, result: { ok: false, error: 'cancelled' } })).to.equal(true);
  });
  it('replaces a versioned preview image using the same File payload', async () => {
    const image = view.state.schema.nodes.image.create({ src: '/old.png' });
    const paragraph = view.state.schema.nodes.paragraph.create(null, image);
    const proseIndex = view.state.doc.content.size + 1;
    view.dispatch(view.state.tr.insert(view.state.doc.content.size, paragraph));
    mockPreview({ target: { proseIndex, imageVersion: getImageDocumentVersion(view.state.doc), originalSrc: '/old.png' } });
    sinon.stub(window, 'fetch').callsFake(async (url) => {
      if (String(url).includes('/ping/')) return new Response('', { status: 200 });
      return new Response(JSON.stringify({ source: { contentUrl: './media_drag.png' } }), { status: 201, headers: { 'content-type': 'application/json' } });
    });
    const drag = await start({ files: [new File(['image'], 'photo.png', { type: 'image/png' })] });
    expect(await finish(drag.dragId, { x: 550, y: 150 })).to.deep.equal({ ok: true });
    expect(view.state.doc.nodeAt(proseIndex).attrs.src).to.equal('./media_drag.png');
    expect(view.state.doc.childCount).to.equal(2);
  });
});
