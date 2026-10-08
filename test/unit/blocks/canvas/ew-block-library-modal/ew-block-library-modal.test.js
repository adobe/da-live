import { expect } from '@esm-bundle/chai';
import { setNx, getNx2Api } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const savedFetch = window.fetch;
window.fetch = (url, options) => (url.endsWith('/styles/buttons.css') || url.endsWith('/styles/form.css')
  ? Promise.resolve(new Response(''))
  : savedFetch(url, options));
try {
  await import('../../../../../blocks/canvas/ew-block-library-modal/ew-block-library-modal.js');
} finally {
  window.fetch = savedFetch;
}
const { status } = await getNx2Api();

describe('Block library variant preview navigation', () => {
  let modal;
  let savedStatusGet;
  const block = { name: 'Hero', path: 'https://content.da.live/org/site/library/hero' };
  const previewUrl = 'https://main--site--org.aem.page/library/hero';
  const variants = [
    { name: 'Wide', anchor: 'wide', dom: document.createElement('table') },
    { name: 'Narrow', anchor: 'narrow', description: 'A narrow hero' },
    { name: 'No heading', dom: document.createElement('table') },
  ];

  beforeEach(async () => {
    savedStatusGet = status.get;
    status.get = async () => new Response(JSON.stringify({ preview: { status: 200 } }));
    modal = document.createElement('ew-block-library-modal');
    modal.blocks = [{ ...block, loadVariants: Promise.resolve(variants) }];
    document.body.append(modal);
    modal._hashState = { org: 'org', site: 'site' };
    modal._expandedPath = block.path;
    modal._selectedPath = block.path;
    modal._previewInfo = { path: block.path, name: block.name, url: previewUrl, ok: true };
    await modal.updateComplete;
    await modal.updateComplete;
  });

  afterEach(() => {
    modal.remove();
    status.get = savedStatusGet;
  });

  function variantButtons() {
    return modal.shadowRoot.querySelectorAll('.modal-tree-row-variant');
  }

  it('Navigates the existing iframe to each variant without inserting or closing', async () => {
    let inserted = false;
    let closed = false;
    modal.onInsert = () => { inserted = true; };
    modal.addEventListener('close', () => { closed = true; });
    const iframe = modal.shadowRoot.querySelector('iframe');
    variantButtons()[0].click();
    await modal.updateComplete;
    expect(iframe.getAttribute('src')).to.equal(`${previewUrl}#wide`);
    variantButtons()[1].click();
    await modal.updateComplete;
    expect(iframe.getAttribute('src')).to.equal(`${previewUrl}#narrow`);
    expect(modal.shadowRoot.querySelector('iframe')).to.equal(iframe);
    expect(modal._previewInfo.ok).to.be.true;
    expect(inserted).to.be.false;
    expect(closed).to.be.false;
  });

  it('Disables preview navigation for variants without headings', async () => {
    expect(variantButtons()[2].disabled).to.be.true;
    variantButtons()[2].click();
    await modal.updateComplete;
    expect(modal._previewInfo.url).to.equal(previewUrl);
  });

  it('Enables a variant after injecting an anchor and explicitly requesting an update', async () => {
    const testVariants = modal._variantsByPath.get(modal._selectedPath);
    expect(variantButtons()[2].disabled).to.be.true;
    try {
      testVariants[2].anchor = 'variant-scroll-test';
      modal.requestUpdate();
      await modal.updateComplete;
      expect(variantButtons()[2].disabled).to.be.false;
      variantButtons()[2].click();
      await modal.updateComplete;
      expect(modal.shadowRoot.querySelector('iframe').getAttribute('src'))
        .to.equal(`${previewUrl}#variant-scroll-test`);
    } finally {
      delete testVariants[2].anchor;
    }
  });

  it('Keeps the Add action available for variants without headings', () => {
    let inserted;
    let closed = false;
    modal.onInsert = (dom) => { inserted = dom; };
    modal.addEventListener('close', () => { closed = true; });
    modal.shadowRoot.querySelectorAll('.modal-tree-add')[2].click();
    expect(inserted).to.equal(variants[2].dom);
    expect(closed).to.be.true;
  });

  it('Keeps description toggles separate from preview navigation', async () => {
    modal.shadowRoot.querySelector('.modal-tree-info').click();
    await modal.updateComplete;
    expect(modal.shadowRoot.querySelector('.modal-tree-description').textContent.trim())
      .to.equal(variants[1].description);
    expect(modal._previewInfo.url).to.equal(previewUrl);
  });

  it('Encodes heading IDs and replaces the previous fragment', () => {
    modal._selectVariant(block, { anchor: 'custom # heading' });
    expect(modal._previewInfo.url).to.equal(`${previewUrl}#custom%20%23%20heading`);
    modal._selectVariant(block, variants[0]);
    expect(modal._previewInfo.url).to.equal(`${previewUrl}#wide`);
  });

  it('Loads the correct block preview when selecting a variant from search results', async () => {
    modal._previewInfo = { path: '/other', name: 'Other', url: 'about:blank', ok: true };
    modal._search = 'wide';
    await modal.updateComplete;
    variantButtons()[0].click();
    expect(modal._selectedPath).to.equal(block.path);
    expect(modal._previewInfo.url).to.equal(`${previewUrl}#wide`);
    await modal.updateComplete;
    expect(modal.shadowRoot.querySelector('iframe').getAttribute('src')).to.equal(`${previewUrl}#wide`);
  });

  it('Applies preview status even when the variant changes while status is loading', async () => {
    let resolveStatus;
    status.get = () => new Promise((resolve) => { resolveStatus = resolve; });
    const loading = modal._loadPreview(block);
    await Promise.resolve();
    modal._selectVariant(block, variants[1]);
    resolveStatus(new Response(JSON.stringify({ preview: { status: 404 } })));
    await loading;
    await modal.updateComplete;
    expect(modal._previewInfo.url).to.equal(`${previewUrl}#narrow`);
    expect(modal._previewInfo.ok).to.be.false;
    expect(modal.shadowRoot.querySelector('.modal-preview-error')).to.exist;
  });

  it('Actually scrolls the iframe to a heading using native fragment navigation', async () => {
    const url = URL.createObjectURL(new Blob([
      '<!doctype html><html><body><h2 id="wide">Wide</h2>',
      '<div style="height:2000px"></div><h2 id="narrow">Narrow</h2>',
      '<div style="height:2000px"></div></body></html>',
    ], { type: 'text/html' }));
    try {
      const iframe = modal.shadowRoot.querySelector('iframe');
      const loaded = new Promise((resolve) => {
        iframe.addEventListener('load', resolve, { once: true });
      });
      modal._previewInfo = { ...modal._previewInfo, url };
      await modal.updateComplete;
      await loaded;
      const navigated = new Promise((resolve) => {
        iframe.contentWindow.addEventListener('hashchange', resolve, { once: true });
      });
      variantButtons()[1].click();
      await modal.updateComplete;
      await navigated;
      expect(iframe.contentWindow.scrollY).to.be.greaterThan(1900);
      expect(iframe.contentDocument.getElementById('narrow').getBoundingClientRect().top)
        .to.be.closeTo(0, 1);
      const previewDocument = iframe.contentDocument;
      iframe.contentWindow.scrollTo(0, 0);
      expect(iframe.contentWindow.scrollY).to.equal(0);
      variantButtons()[1].click();
      await modal.updateComplete;
      await new Promise((resolve) => { setTimeout(resolve, 100); });
      expect(iframe.contentWindow.scrollY).to.be.greaterThan(1900);
      expect(iframe.contentDocument).to.equal(previewDocument);
    } finally {
      URL.revokeObjectURL(url);
    }
  });
});
