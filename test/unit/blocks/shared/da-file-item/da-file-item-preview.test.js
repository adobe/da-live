/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { stub, spy, restore } from 'sinon';
import { setNx, getNx2Api } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../../blocks/shared/da-file-item/da-file-item.js');

describe('da-file-item preview', () => {
  let el;
  let onIntersect;
  let observer;

  beforeEach(() => {
    observer = { observe: spy(), disconnect: spy() };
    stub(window, 'IntersectionObserver').callsFake((callback) => {
      onIntersect = callback;
      return observer;
    });
  });

  afterEach(() => {
    el?.remove();
    restore();
  });

  async function fixture(props) {
    el = document.createElement('da-file-item');
    el.view = 'card';
    el.editor = '/edit#';
    Object.assign(el, props);
    document.body.append(el);
    await el.updateComplete;
  }

  it('Renders the type icon for non-image files', async () => {
    await fixture({ ext: 'json', path: '/o/s/a.json' });
    expect(el.shadowRoot.querySelector('.card-preview svg use')).to.exist;
  });

  it('Shows a spinner when busy', async () => {
    await fixture({ ext: 'png', path: '/o/s/a.png', _isRenaming: true });
    expect(el.shadowRoot.querySelector('.file-preview-spinner')).to.exist;
    expect(el.shadowRoot.querySelector('.card-preview svg')).to.be.null;
  });

  it('Shows the image and falls back to the icon on error without retrying', async () => {
    await fixture({ ext: 'png', path: '/o/s/a.png' });
    el._imageRequested = true;
    el._imageUrl = 'blob:preview';
    await el.updateComplete;
    const img = el.shadowRoot.querySelector('img');
    expect(img.getAttribute('src')).to.equal('blob:preview');
    img.dispatchEvent(new Event('error'));
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('img')).to.be.null;
    expect(el.shadowRoot.querySelector('.card-preview svg')).to.exist;
  });

  it('Resets the image when the path changes', async () => {
    await fixture({ ext: 'png', path: '/o/s/a.png' });
    el._imageRequested = true;
    el._imageUrl = 'blob:preview';
    el.path = '/o/s/b.png';
    await el.updateComplete;
    expect(el._imageUrl).to.be.null;
    expect(el._imageRequested).to.be.false;
  });

  it('only observes images in card view', async () => {
    await fixture({ ext: 'png', path: '/o/s/a.png', view: 'list' });
    expect(observer.observe.called).to.equal(false);
    el.view = 'card';
    await el.updateComplete;
    expect(observer.observe.calledOnceWithExactly(el)).to.equal(true);
    el.view = 'list';
    await el.updateComplete;
    expect(observer.disconnect.calledOnce).to.equal(true);
  });

  it('loads once on visibility and releases the image on disconnect', async () => {
    const { source } = await getNx2Api();
    const blob = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'image/svg+xml' });
    const get = stub(source, 'get').resolves({ ok: true, blob: async () => blob });
    const revoke = spy(URL, 'revokeObjectURL');
    await fixture({ ext: 'png', path: '/o/s/a.png' });
    const load = spy(el, 'loadImage');
    expect(get.called).to.equal(false);
    onIntersect([{ isIntersecting: false }]);
    expect(get.called).to.equal(false);
    onIntersect([{ isIntersecting: true }]);
    await load.firstCall.returnValue;
    await el.updateComplete;
    expect(get.calledOnceWithExactly('/o/s/a.png')).to.equal(true);
    expect(observer.disconnect.calledOnce).to.equal(true);
    const url = el._imageUrl;
    expect(url).to.match(/^blob:/);
    el.remove();
    expect(revoke.calledWithExactly(url)).to.equal(true);
    expect(el._imageUrl).to.equal(null);
  });

  it('discards an image that finishes loading after switching to list view', async () => {
    const { source } = await getNx2Api();
    let finish;
    stub(source, 'get').returns(new Promise((resolve) => { finish = resolve; }));
    const revoke = spy(URL, 'revokeObjectURL');
    await fixture({ ext: 'png', path: '/o/s/a.png' });
    const loading = el.loadImage();
    await Promise.resolve();
    el.view = 'list';
    await el.updateComplete;
    finish({ ok: true, blob: async () => new Blob(['image']) });
    await loading;
    expect(el._imageUrl).to.equal(null);
    expect(revoke.calledOnce).to.equal(true);
  });
});
