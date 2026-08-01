import { expect } from '@esm-bundle/chai';
import { setNx, getNx } from '../../../../../scripts/utils.js';
import { getExtensionsBridge } from '../../../../../blocks/canvas/editor-utils/extensions-bridge.js';
import { captureAsync } from '../test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

// Dynamic, and after setNx: editor-utils.js transitively needs getNx()
// configured before its own module body (quick-edit-messages.js) runs.
const { getPreviewOrigin } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js');

// Import the same way the component does (a computed `${getNx()}/...` specifier)
// so this resolves to the identical cached module instance, not a second copy.
const { hashChange } = await import(`${getNx()}/utils/utils.js`);

await import('../../../../../blocks/canvas/ew-panel-extensions/ew-panel-library.js');

describe('Ew panel library _insertTemplate', () => {
  let savedFetch;
  let savedExtensionsBridge;

  beforeEach(() => {
    savedFetch = window.fetch;
    savedExtensionsBridge = getExtensionsBridge().view;
  });

  afterEach(() => {
    window.fetch = savedFetch;
    getExtensionsBridge().view = savedExtensionsBridge;
  });

  it('should not fetch when there is no editor view', async () => {
    getExtensionsBridge().view = null;
    let fetched = false;
    window.fetch = () => {
      fetched = true;
      return Promise.resolve(new Response('', { status: 404 }));
    };

    const el = document.createElement('ew-panel-library');
    await el._insertTemplate({ key: 'home', value: 'https://content.da.live/org/site/home' });

    expect(fetched).to.be.false;
  });

  it('should fetch item.value when an editor view is present', async () => {
    getExtensionsBridge().view = {};
    let fetchedUrl;
    window.fetch = (url) => {
      fetchedUrl = url;
      return Promise.resolve(new Response('', { status: 404 }));
    };

    const el = document.createElement('ew-panel-library');
    await el._insertTemplate({ key: 'home', value: 'https://content.da.live/org/site/home' });

    expect(fetchedUrl).to.equal('https://content.da.live/org/site/home');
  });
});

describe('Ew panel library preview', () => {
  const SOURCE_URL = 'https://example.com/blocks-sheet.json';
  const BLOCK_PATH = 'https://example.com/blocks/hero';
  const STATUS_URL = 'https://admin.hlx.page/status/acme/mysite/main/blocks/hero';
  // Preview is routed through DA's preview proxy, not raw aem.page — aem.page's
  // CDN blocks cross-origin fetch of full pages, and this proxy is also the
  // route to protected-site auth (via the cookie exchange in _openPreview).
  const PREVIEW_URL = `${getPreviewOrigin('acme', 'mysite', 'main')}/blocks/hero`;

  let savedFetch;
  let el;

  beforeEach(() => {
    savedFetch = window.fetch;
    hashChange._set({ org: 'acme', site: 'mysite' });
    window.fetch = (url) => {
      if (url === SOURCE_URL) {
        return Promise.resolve(new Response(
          JSON.stringify([{ name: 'Hero', path: BLOCK_PATH }]),
          { status: 200 },
        ));
      }
      if (url === BLOCK_PATH) {
        return Promise.resolve(new Response(`
          <body><div>
            <div class="hero"><div><div>content</div></div></div>
          </div></body>
        `, { status: 200 }));
      }
      if (url === STATUS_URL) {
        return Promise.resolve(new Response(
          JSON.stringify({ preview: { status: 200 } }),
          { status: 200 },
        ));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    };
  });

  afterEach(() => {
    window.fetch = savedFetch;
    el?.remove();
    hashChange._set({});
  });

  it('previews the whole source page for the clicked block, via the DA preview proxy', async () => {
    el = document.createElement('ew-panel-library');
    document.body.append(el);
    await el.updateComplete;

    // willUpdate fires _loadItems fire-and-forget; capture its promise so we
    // can await the fetch it kicks off before inspecting rendered items.
    const loadCall = captureAsync(el, '_loadItems');

    el.extension = { name: 'blocks', title: 'Blocks', ootb: true, sources: [SOURCE_URL] };
    await el.updateComplete;
    await loadCall.pending;
    await el.updateComplete;

    const previewBtn = el.shadowRoot.querySelector('.ext-preview-btn');
    expect(previewBtn, 'block preview button should be rendered').to.exist;

    const previewCall = captureAsync(el, '_openPreview');
    previewBtn.click();
    await previewCall.pending;

    expect(el._preview.name).to.equal('Hero');
    expect(el._preview.url).to.equal(PREVIEW_URL);
    expect(el._preview.ok).to.be.true;
  });
});
