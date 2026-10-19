/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx, getNx2Api } from '../../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../../../blocks/browse/v2/da-card-preview/da-card-preview.js');
const { source } = await getNx2Api();

describe('da-card-preview', () => {
  let el;

  afterEach(() => {
    el?.remove();
    sinon.restore();
  });

  async function fixture(props) {
    el = document.createElement('da-card-preview');
    Object.assign(el, props);
    document.body.append(el);
    await el.updateComplete;
  }

  it('Renders the type icon for non-image files', async () => {
    await fixture({ ext: 'json', path: '/o/s/a.json' });
    expect(el.shadowRoot.querySelector('svg use')).to.exist;
  });

  it('Shows a spinner when busy', async () => {
    await fixture({ ext: 'png', path: '/o/s/a.png', busy: true });
    expect(el.shadowRoot.querySelector('.spinner')).to.exist;
    expect(el.shadowRoot.querySelector('svg')).to.be.null;
  });

  it('supports a caller-owned semantic icon without changing the default', async () => {
    await fixture({ ext: 'html', path: '/o/s/a.html', iconHref: '/blocks/landing/page.svg' });
    expect(el.shadowRoot.querySelector('.type-icon').getAttribute('style')).to.include('page.svg');
    expect(el.shadowRoot.querySelector('svg')).to.be.null;
  });

  it('renders source-backed document content without inserting source markup', async () => {
    sinon.stub(source, 'get').resolves(new Response('<main><h1>&lt;img src=x&gt;</h1><p>Actual page content</p><script>document.body.dataset.executed = true</script><img src="javascript:void(0)"></main>'));
    await fixture({ ext: 'html', path: '/o/s/a.html', documentPreview: true });
    await el.loadImage();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.document-preview strong').textContent).to.equal('<img src=x>');
    expect(el.shadowRoot.querySelector('.document-preview p').textContent).to.equal('Actual page content');
    expect(el.shadowRoot.querySelector('script, img')).to.be.null;
    expect(document.body.dataset.executed).to.equal(undefined);
  });

  it('reports unavailable document previews instead of inventing content', async () => {
    sinon.stub(source, 'get').resolves(new Response('', { status: 403 }));
    await fixture({ ext: 'html', path: '/o/s/a.html', documentPreview: true, iconHref: '/blocks/landing/page.svg' });
    await el.loadImage();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[role="status"]').textContent).to.equal('Page preview unavailable.');
    expect(el.shadowRoot.querySelector('.document-preview')).to.be.null;
  });

  it('does not attach a stale document preview to a different path', async () => {
    let finish;
    sinon.stub(source, 'get').returns(new Promise((resolve) => { finish = resolve; }));
    await fixture({ ext: 'html', path: '/o/s/a.html', documentPreview: true });
    el.stopObserving();
    const request = el.loadImage();
    await Promise.resolve();
    el.path = '/o/s/b.html';
    await el.updateComplete;
    el.stopObserving();
    finish(new Response('<main><h1>Old page</h1></main>'));
    await request;
    expect(el._document).to.equal(undefined);
  });

  it('returns to the ordinary icon when document previews are disabled', async () => {
    await fixture({ ext: 'html', path: '/o/s/a.html', documentPreview: true });
    el.stopObserving();
    el._imageRequested = true;
    el._document = { title: 'A page', text: 'Source content' };
    await el.updateComplete;
    el.documentPreview = false;
    await el.updateComplete;
    expect(el._document).to.equal(undefined);
    expect(el.shadowRoot.querySelector('.document-preview')).to.be.null;
    expect(el.shadowRoot.querySelector('svg')).to.exist;
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
    expect(el.shadowRoot.querySelector('svg')).to.exist;
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
});
