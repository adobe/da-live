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

describe('Ew block library modal preview', () => {
  const BLOCK_PATH = 'https://example.com/blocks/hero';
  const STATUS_URL = 'https://admin.hlx.page/status/acme/mysite/main/blocks/hero';
  // Preview is routed through DA's preview proxy, not raw aem.page — aem.page's
  // CDN blocks cross-origin fetch of full pages, and this proxy is also the
  // route to protected-site auth (via the cookie exchange in _loadPreview).
  const PREVIEW_URL = `${getPreviewOrigin('acme', 'mysite', 'main')}/blocks/hero`;

  let savedFetch;
  let el;
  let variant;
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
      return Promise.resolve(new Response('', { status: 404 }));
    };

    variant = { name: 'Hero', dom: document.createElement('table') };
    block = { name: 'Hero', path: BLOCK_PATH, loadVariants: Promise.resolve([variant]) };
  });

  afterEach(() => {
    window.fetch = savedFetch;
    el?.remove();
    hashChange._set({});
  });

  it('previews the whole source page for the clicked block, via the DA preview proxy', async () => {
    el = document.createElement('ew-block-library-modal');
    document.body.append(el);
    await el.updateComplete;
    el.blocks = [block];
    await el.updateComplete;
    await block.loadVariants;
    await el.updateComplete;

    // _selectBlock fires _loadPreview without awaiting it internally; capture
    // whichever promise each call kicks off so the test can wait for the
    // fetch chain to actually settle.
    const selectCall = captureAsync(el, '_selectBlock');
    const previewCall = captureAsync(el, '_loadPreview');

    const blockRow = el.shadowRoot.querySelector('.modal-tree-row');
    blockRow.click();
    await selectCall.pending;
    await previewCall.pending;
    await el.updateComplete;

    expect(el._previewInfo.name).to.equal('Hero');
    expect(el._previewInfo.url).to.equal(PREVIEW_URL);
    expect(el._previewInfo.ok).to.be.true;
  });
});
