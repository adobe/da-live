import { expect } from '@esm-bundle/chai';
import { setNx, getNx } from '../../../../../scripts/utils.js';
import { captureAsync } from '../test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

// Dynamic, and after setNx: editor-utils.js transitively needs getNx()
// configured before its own module body (quick-edit-messages.js) runs.
const { getPreviewOrigin } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js');

// Import the same way the component does (a computed `${getNx()}/...` specifier)
// so this resolves to the identical cached module instance, not a second copy.
const { hashChange } = await import(`${getNx()}/utils/utils.js`);

await import('../../../../../blocks/canvas/ew-block-library-modal/ew-block-library-modal.js');

describe('Ew block library modal variant preview', () => {
  const BLOCK_PATH = 'https://example.com/blocks/hero';
  const STATUS_URL = 'https://admin.hlx.page/status/acme/mysite/main/blocks/hero';
  // Preview is routed through DA's preview proxy, not raw aem.page (see #1202).
  const PREVIEW_URL = `${getPreviewOrigin('acme', 'mysite', 'main')}/blocks/hero`;

  let savedFetch;
  let el;
  let variantA;
  let variantB;
  let block;

  beforeEach(() => {
    savedFetch = window.fetch;
    hashChange._set({ org: 'acme', site: 'mysite' });
    window.fetch = (url) => {
      if (url === STATUS_URL) {
        return Promise.resolve(new Response(
          JSON.stringify({ preview: { status: 200 } }),
          { status: 200 },
        ));
      }
      if (url === PREVIEW_URL) {
        return Promise.resolve(new Response(
          '<html><head><link rel="stylesheet" href="/styles/styles.css"></head><body></body></html>',
          { status: 200 },
        ));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    };

    const rawDomA = document.createElement('div');
    rawDomA.className = 'hero';
    variantA = { name: 'Hero A', dom: document.createElement('table'), rawDom: rawDomA };

    const rawDomB = document.createElement('div');
    rawDomB.className = 'hero variant-2';
    variantB = { name: 'Hero B', dom: document.createElement('table'), rawDom: rawDomB };

    block = { name: 'Hero', path: BLOCK_PATH, loadVariants: Promise.resolve([variantA, variantB]) };
  });

  afterEach(() => {
    window.fetch = savedFetch;
    el?.remove();
    hashChange._set({});
  });

  it('previews only the clicked variant, not the whole source page', async () => {
    el = document.createElement('ew-block-library-modal');
    document.body.append(el);
    await el.updateComplete;
    el.blocks = [block];
    await el.updateComplete;
    await block.loadVariants;
    await el.updateComplete;

    // _selectBlock/_loadPreview fire click-triggered work without awaiting it
    // internally; capture whichever promise each call kicks off so the test
    // can wait for the fetch chain to actually settle.
    const selectCall = captureAsync(el, '_selectBlock');
    const previewCall = captureAsync(el, '_loadPreview');

    // Expanding the block auto-previews its first variant.
    const blockRow = el.shadowRoot.querySelector('.modal-tree-row');
    blockRow.click();
    await selectCall.pending;
    await previewCall.pending;
    await el.updateComplete;

    expect(el._previewInfo.name).to.equal('Hero A');
    expect(el._previewInfo.html).to.contain('class="hero"');
    expect(el._previewInfo.html).to.not.contain('variant-2');

    // Clicking the second variant re-scopes the preview to it.
    const variantRows = el.shadowRoot.querySelectorAll('.modal-tree-row-variant');
    expect(variantRows, 'both variants should be rendered').to.have.lengthOf(2);

    variantRows[1].click();
    await previewCall.pending;

    expect(el._previewInfo.name).to.equal('Hero B');
    expect(el._previewInfo.html).to.contain('variant-2');
  });
});
