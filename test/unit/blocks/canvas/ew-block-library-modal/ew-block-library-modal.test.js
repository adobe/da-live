import { expect } from '@esm-bundle/chai';
import { setNx, getNx2Api } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

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
const { getBlockVariants, resetBlockLibraryCache } = await import('../../../../../blocks/canvas/ew-panel-extensions/helpers.js');

function responseGate() {
  let release;
  let notify;
  const response = new Promise((resolve) => { release = resolve; });
  const ready = new Promise((resolve) => { notify = resolve; });
  return { response, ready, release, notify };
}

describe('Block library variant preview navigation', () => {
  let modal;
  let savedStatusGet;
  let savedIMS;
  let savedNxIms;
  const block = { name: 'Hero', path: 'https://content.da.live/org/site/library/hero' };
  const branchState = { org: 'org', site: 'site', path: '/org/site/page', status: 'ready', branch: 'main' };
  const previewUrl = 'https://main--site--org.stage-preview.da.live/library/hero';
  const variants = [
    { name: 'Wide', anchor: 'wide', dom: document.createElement('table') },
    { name: 'Narrow', anchor: 'narrow', description: 'A narrow hero' },
    { name: 'No heading', dom: document.createElement('table') },
  ];

  beforeEach(async () => {
    resetBlockLibraryCache();
    savedIMS = window.adobeIMS;
    savedNxIms = localStorage.getItem('nx-ims');
    localStorage.setItem('nx-ims', 'true');
    window.adobeIMS = { getAccessToken: () => ({ token: 'test-token' }) };
    window.fetch = async () => new Response('');
    savedStatusGet = status.get;
    status.get = async () => new Response(JSON.stringify({ preview: { status: 200 } }));
    canvasBus.branchState.emit(branchState);
    modal = document.createElement('ew-block-library-modal');
    modal.blocks = [{ ...block, loadVariants: Promise.resolve(variants) }];
    document.body.append(modal);
    modal._hashState = { org: 'org', site: 'site' };
    modal._expandedPath = block.path;
    modal._selectedPath = block.path;
    modal._previewBlock = block;
    modal._previewInfo = { path: block.path, name: block.name, url: previewUrl, ok: true };
    await modal.updateComplete;
    await modal.updateComplete;
  });

  afterEach(() => {
    modal.remove();
    canvasBus.branchState.emit({ path: null, status: 'pending' });
    status.get = savedStatusGet;
    window.fetch = savedFetch;
    if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
    if (savedNxIms === null) localStorage.removeItem('nx-ims');
    else localStorage.setItem('nx-ims', savedNxIms);
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

  it('Navigates to duplicate and Unicode anchors parsed from DA source HTML', async () => {
    const html = `
      <main><div>
        <h2>Default</h2>
        <div class="hero"><div><div>first</div></div></div>
        <h2>Default</h2>
        <div class="hero"><div><div>second</div></div></div>
        <h2>Über</h2>
        <div class="hero"><div><div>third</div></div></div>
      </div></main>
    `;
    const previousFetch = window.fetch;
    let parsedVariants;
    window.fetch = () => Promise.resolve(new Response(html));
    try {
      parsedVariants = await getBlockVariants(block.path);
    } finally {
      window.fetch = previousFetch;
    }
    modal._variantsByPath = new Map([[block.path, parsedVariants]]);
    await modal.updateComplete;

    const iframe = modal.shadowRoot.querySelector('iframe');
    variantButtons()[1].click();
    await modal.updateComplete;
    expect(iframe.getAttribute('src')).to.equal(`${previewUrl}#default-1`);
    variantButtons()[2].click();
    await modal.updateComplete;
    expect(iframe.getAttribute('src')).to.equal(`${previewUrl}#%C3%BCber`);
    expect(modal.shadowRoot.querySelector('iframe')).to.equal(iframe);
  });

  it('Loads the correct block preview when selecting a variant from search results', async () => {
    modal._previewInfo = { path: '/other', name: 'Other', url: 'about:blank', ok: true };
    modal._search = 'wide';
    await modal.updateComplete;
    await modal._selectVariant(block, variants[0]);
    expect(modal._selectedPath).to.equal(block.path);
    expect(modal._previewInfo.url).to.equal(`${previewUrl}#wide`);
    await modal.updateComplete;
    expect(modal.shadowRoot.querySelector('iframe').getAttribute('src')).to.equal(`${previewUrl}#wide`);
  });

  it('Uses the configured canvas branch when loading a variant preview', async () => {
    canvasBus.branchState.emit({ ...branchState, branch: 'Configured/Branch' });
    modal._previewInfo = null;
    await modal._selectVariant(block, variants[0]);
    await modal.updateComplete;
    expect(modal._previewBlock).to.equal(block);
    expect(modal._previewInfo.url)
      .to.equal('https://configured-branch--site--org.stage-preview.da.live/library/hero#wide');
  });

  it('Retries a selected variant preview when the canvas branch becomes ready', async () => {
    canvasBus.branchState.emit({ ...branchState, status: 'pending' });
    modal._previewInfo = null;
    await modal._selectVariant(block, variants[0]);
    await modal.updateComplete;
    expect(modal._previewInfo.error).to.include('Preview branch unavailable');
    expect(modal.shadowRoot.querySelector('iframe')).to.be.null;
    const gate = responseGate();
    status.get = () => {
      gate.notify();
      return gate.response;
    };
    canvasBus.branchState.emit(branchState);
    await gate.ready;
    gate.release(new Response(JSON.stringify({ preview: { status: 200 } })));
    await modal.updateComplete;
    expect(modal._previewInfo.url).to.equal(`${previewUrl}#wide`);
    expect(modal.shadowRoot.querySelector('iframe')).to.exist;
  });

  it('Ignores a pending status result if the preview branch becomes unavailable', async () => {
    const gate = responseGate();
    status.get = () => {
      gate.notify();
      return gate.response;
    };
    const loading = modal._loadPreview(block, variants[0].anchor);
    await gate.ready;
    canvasBus.branchState.emit({ ...branchState, status: 'error' });
    gate.release(new Response(JSON.stringify({ preview: { status: 200 } })));
    await loading;
    await Promise.resolve();
    await modal.updateComplete;
    expect(modal._previewInfo.error).to.include('Preview branch unavailable');
    expect(modal.shadowRoot.querySelector('iframe')).to.be.null;
  });

  it('Applies preview status even when the variant changes while status is loading', async () => {
    const gate = responseGate();
    status.get = () => {
      gate.notify();
      return gate.response;
    };
    const loading = modal._loadPreview(block);
    await gate.ready;
    await modal._selectVariant(block, variants[1]);
    gate.release(new Response(JSON.stringify({ preview: { status: 404 } })));
    await loading;
    await modal.updateComplete;
    expect(modal._previewInfo.url).to.equal(`${previewUrl}#narrow`);
    expect(modal._previewInfo.ok).to.be.false;
    expect(modal.shadowRoot.querySelector('.modal-preview-error')).to.exist;
  });

  it('Waits for proxy authentication before loading a selected variant fragment', async () => {
    const gate = responseGate();
    const calls = [];
    window.fetch = (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/gimme_cookie')) {
        gate.notify();
        return gate.response;
      }
      return Promise.resolve(new Response(''));
    };
    modal._previewInfo = null;
    const loading = modal._selectVariant(block, variants[0]);
    await gate.ready;
    await modal.updateComplete;
    expect(modal.shadowRoot.querySelector('iframe')).to.be.null;
    gate.release(new Response(''));
    await loading;
    await modal.updateComplete;
    expect(calls.map(({ url }) => url)).to.deep.equal([
      'https://main--site--org.stage-preview.da.live/gimme_cookie',
      previewUrl,
    ]);
    expect(calls[1].options.method).to.equal('HEAD');
    expect(modal.shadowRoot.querySelector('iframe').getAttribute('src')).to.equal(`${previewUrl}#wide`);
  });

  it('Keeps the latest variant when authentication for the same block is pending', async () => {
    const gate = responseGate();
    window.fetch = (url) => {
      if (url.endsWith('/gimme_cookie')) {
        gate.notify();
        return gate.response;
      }
      return Promise.resolve(new Response(''));
    };
    const loading = modal._loadPreview(block, variants[0].anchor);
    await gate.ready;
    await modal._selectVariant(block, variants[1]);
    gate.release(new Response(''));
    await loading;
    expect(modal._previewInfo.url).to.equal(`${previewUrl}#narrow`);
    expect(modal._previewInfo.ok).to.be.true;
  });

  it('Cancels another pending block preview when returning to a visible variant', async () => {
    const gate = responseGate();
    window.fetch = (url) => {
      if (url.includes('--other--') && url.endsWith('/gimme_cookie')) {
        gate.notify();
        return gate.response;
      }
      return Promise.resolve(new Response(''));
    };
    const loading = modal._loadPreview({ name: 'Other', path: 'https://main--other--org.aem.page/other' });
    await gate.ready;
    await modal._selectVariant(block, variants[1]);
    gate.release(new Response(''));
    await loading;
    expect(modal._previewBlock).to.equal(block);
    expect(modal._selectedPath).to.equal(block.path);
    expect(modal._previewInfo.url).to.equal(`${previewUrl}#narrow`);
    expect(modal._previewInfo.ok).to.be.true;
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
