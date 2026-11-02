import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import '../../../../blocks/landing/file-preview.js';
import { getNx2Api } from '../../../../scripts/utils.js';

const { source } = await getNx2Api();

describe('Content list image previews', () => {
  let el;
  let get;
  let create;
  let revoke;
  let observers;

  beforeEach(async () => {
    observers = [];
    sinon.stub(window, 'IntersectionObserver').callsFake((callback) => {
      const observer = { callback, observe: sinon.spy(), disconnect: sinon.spy() };
      observers.push(observer);
      return observer;
    });
    get = sinon.stub(source, 'get').callsFake(async () => new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
      { headers: { 'Content-Type': 'image/svg+xml' } },
    ));
    create = sinon.spy(URL, 'createObjectURL');
    revoke = sinon.spy(URL, 'revokeObjectURL');
    el = document.createElement('da-landing-preview');
    el.path = '/org/site/image.png';
    el.ext = 'png';
    document.body.append(el);
    await el.updateComplete;
  });

  afterEach(() => {
    el.remove();
    sinon.restore();
  });

  it('loads image data only after intersection and releases the object URL on removal', async () => {
    expect(get.called).to.equal(false);
    const loading = sinon.spy(el, 'loadImage');
    observers[0].callback([{ isIntersecting: true }]);
    await loading.firstCall.returnValue;
    await el.updateComplete;
    expect(get.calledOnceWithExactly('/org/site/image.png')).to.equal(true);
    const url = create.firstCall.returnValue;
    expect(el.shadowRoot.querySelector('img').getAttribute('src')).to.equal(url);
    el.remove();
    expect(revoke.calledWith(url)).to.equal(true);
  });

  it('retains the type icon after failed requests and image errors', async () => {
    get.resolves(new Response(null, { status: 403 }));
    await el.loadImage();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('img')).to.equal(null);
    get.resolves(new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', { headers: { 'Content-Type': 'image/svg+xml' } }));
    await el.loadImage();
    await el.updateComplete;
    el.shadowRoot.querySelector('img').dispatchEvent(new Event('error'));
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('svg')).not.to.equal(null);
    expect(revoke.calledWith(create.firstCall.returnValue)).to.equal(true);
  });

  it('discards in-flight image data after site changes', async () => {
    let finish;
    get.returns(new Promise((resolve) => { finish = resolve; }));
    const loading = el.loadImage();
    await Promise.resolve();
    el.path = '/other/site/new.png';
    await el.updateComplete;
    finish(new Response('old image'));
    await loading;
    expect(el._imageUrl).to.equal(null);
    expect(revoke.calledWith(create.firstCall.returnValue)).to.equal(true);
  });
});
