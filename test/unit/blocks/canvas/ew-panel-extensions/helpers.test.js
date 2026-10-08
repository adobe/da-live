import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { setCommentsController } from '../../../../../blocks/canvas/editor-utils/comments-bridge.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
import { setDaConfigs } from '../../../../fixtures/nx/utils/daConfig.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getBlockVariants;
let extensionToPanelView;
let getPreviewStatus;
let createCommentsView;
let createMetadataView;
let getCanvasToolPanelViews;
let fetchExtensions;
let getItemPreviewUrl;
let loadBlockLibrary;
let resetBlockLibraryCache;
let fetchBlocks;
let fetchItems;
let insertTemplate;
let ensureItemPreviewAccess;
let loadBlockOptions;
let loadBlockEditor;
let resetBlockOptionsCache;

before(async () => {
  const mod = await import('../../../../../blocks/canvas/ew-panel-extensions/helpers.js');
  getBlockVariants = mod.getBlockVariants;
  extensionToPanelView = mod.extensionToPanelView;
  getPreviewStatus = mod.getPreviewStatus;
  createCommentsView = mod.createCommentsView;
  createMetadataView = mod.createMetadataView;
  getCanvasToolPanelViews = mod.getCanvasToolPanelViews;
  fetchExtensions = mod.fetchExtensions;
  getItemPreviewUrl = mod.getItemPreviewUrl;
  loadBlockLibrary = mod.loadBlockLibrary;
  resetBlockLibraryCache = mod.resetBlockLibraryCache;
  fetchBlocks = mod.fetchBlocks;
  fetchItems = mod.fetchItems;
  insertTemplate = mod.insertTemplate;
  ensureItemPreviewAccess = mod.ensureItemPreviewAccess;
  loadBlockOptions = mod.loadBlockOptions;
  loadBlockEditor = mod.loadBlockEditor;
  resetBlockOptionsCache = mod.resetBlockOptionsCache;
});

// The DA Preview Proxy host: `<ref>--<site>--<org>.(stage-)preview.da.live`.
// Which of stage-/prod is chosen depends on the running host, so the tests
// accept either — the guarantee under test is that library content routes
// through the proxy and never straight to `aem.live`/`aem.page`.
const PROXY_HOST = /^https:\/\/main--proxysite--proxyorg\.(stage-preview|preview)\.da\.live\//;
const LIBRARY_CONTEXT = { org: 'proxyorg', site: 'proxysite' };

describe('EW panel helpers transformBlock', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  function mockHtml(html) {
    window.fetch = () => Promise.resolve(new Response(html, { status: 200 }));
  }

  it('Uses data-groupheading as the name for grouped blocks', async () => {
    mockHtml(`
      <body><div>
        <h2>My Group</h2>
        <div class="library-container-start"></div>
        <div class="hero"><div><div>content</div></div></div>
        <div class="library-container-end"></div>
      </div></body>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants).to.have.lengthOf(1);
    expect(variants[0].name).to.equal('My Group');
  });

  it('Falls back to the preceding heading text when no groupheading', async () => {
    mockHtml(`
      <body><div>
        <h2>Block Title</h2>
        <div class="hero"><div><div>content</div></div></div>
      </div></body>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants).to.have.lengthOf(1);
    expect(variants[0].name).to.equal('Block Title');
  });

  it('Falls back to class name when there is no groupheading and no preceding heading', async () => {
    mockHtml(`
      <body><div>
        <div class="hero wide"><div><div>content</div></div></div>
      </div></body>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants).to.have.lengthOf(1);
    expect(variants[0].name).to.equal('hero');
    expect(variants[0].variants).to.equal('wide');
  });

  it('Returns an empty array when the fetch fails', async () => {
    window.fetch = () => Promise.resolve(new Response('error', { status: 500 }));
    const variants = await getBlockVariants('/mock-path');
    expect(variants).to.deep.equal([]);
  });

  it('Returns a table as item.dom for a regular block', async () => {
    mockHtml(`
      <body><div>
        <div class="hero"><div><div>content</div></div></div>
      </div></body>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants[0].dom).to.be.instanceOf(window.HTMLTableElement);
  });

  it('Returns a div as item.dom for a grouped block', async () => {
    mockHtml(`
      <body><div>
        <h2>My Group</h2>
        <div class="library-container-start"></div>
        <div class="hero"><div><div>content</div></div></div>
        <div class="library-container-end"></div>
      </div></body>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants[0].dom).to.be.instanceOf(window.HTMLDivElement);
  });

  it('Sets item.tags from searchtags in nextElementSibling library-metadata', async () => {
    mockHtml(`
      <body><div>
        <div class="hero"><div><div>content</div></div></div>
        <div class="library-metadata"><div><div>searchtags</div><div>hero, card</div></div></div>
      </div></body>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants[0].tags).to.equal('hero, card');
  });

  it('Sets item.description from description in nextElementSibling library-metadata', async () => {
    mockHtml(`
      <body><div>
        <div class="hero"><div><div>content</div></div></div>
        <div class="library-metadata"><div><div>description</div><div>A hero block</div></div></div>
      </div></body>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants[0].description).to.equal('A hero block');
  });

  it('Sets item.tags from searchtags in embedded library-metadata', async () => {
    mockHtml(`
      <body><div>
        <div class="hero">
          <div><div>content</div></div>
          <div class="library-metadata"><div><div>searchtags</div><div>hero, banner</div></div></div>
        </div>
      </div></body>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants[0].tags).to.equal('hero, banner');
  });

  it('Sets both tags and description when both present in library-metadata', async () => {
    mockHtml(`
      <body><div>
        <div class="hero"><div><div>content</div></div></div>
        <div class="library-metadata">
          <div><div>searchtags</div><div>hero, card</div></div>
          <div><div>description</div><div>A hero block</div></div>
        </div>
      </div></body>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants[0].tags).to.equal('hero, card');
    expect(variants[0].description).to.equal('A hero block');
  });

  it('Does not set tags or description when no library-metadata is present', async () => {
    mockHtml(`
      <body><div>
        <div class="hero"><div><div>content</div></div></div>
      </div></body>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants[0].tags).to.be.undefined;
    expect(variants[0].description).to.be.undefined;
  });

  it('Sets tags from library-metadata appended after library-container-end in a group', async () => {
    mockHtml(`
      <body><div>
        <h2>My Group</h2>
        <div class="library-container-start"></div>
        <div class="hero"><div><div>content</div></div></div>
        <div class="library-container-end"></div>
        <div class="library-metadata"><div><div>searchtags</div><div>group, hero</div></div></div>
      </div></body>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants[0].tags).to.equal('group, hero');
  });

  it('Group dom contains both a table for the block and cloned non-div siblings', async () => {
    mockHtml(`
      <main><div>
        <h2>Hero with text</h2>
        <div class="library-container-start"><div><div></div></div></div>
        <div class="hero"><div><div>content</div></div></div>
        <p>Lorem ipsum</p>
        <div class="library-container-end"><div><div></div></div></div>
      </div></main>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants[0].name).to.equal('Hero with text');
    const { dom } = variants[0];
    expect(dom).to.be.instanceOf(window.HTMLDivElement);
    expect(dom.querySelector('table')).to.not.be.null;
    expect(dom.querySelector('p')).to.not.be.null;
  });

  it('Excludes embedded library-metadata from item.dom', async () => {
    mockHtml(`
      <body><div>
        <div class="hero">
          <div><div>content</div></div>
          <div class="library-metadata"><div><div>searchtags</div><div>hero, banner</div></div></div>
        </div>
      </div></body>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants[0].dom.querySelector('.library-metadata')).to.be.null;
  });

  it('Excludes library-metadata appended after library-container-end from group item.dom', async () => {
    mockHtml(`
      <body><div>
        <h2>My Group</h2>
        <div class="library-container-start"></div>
        <div class="hero"><div><div>content</div></div></div>
        <div class="library-container-end"></div>
        <div class="library-metadata"><div><div>searchtags</div><div>group, hero</div></div></div>
      </div></body>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants[0].dom.querySelector('.library-metadata')).to.be.null;
  });

  it('Extracts and excludes library-metadata placed before a single block, preserving heading name', async () => {
    mockHtml(`
      <body><div>
        <h2>Block Title</h2>
        <div class="library-metadata"><div><div>searchtags</div><div>early, meta</div></div></div>
        <div class="hero"><div><div>content</div></div></div>
      </div></body>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants).to.have.lengthOf(1);
    expect(variants[0].name).to.equal('Block Title');
    expect(variants[0].tags).to.equal('early, meta');
    expect(variants[0].dom.querySelector('.library-metadata')).to.be.null;
  });

  it('Extracts and excludes library-metadata placed between library-container-start/end', async () => {
    mockHtml(`
      <body><div>
        <h2>My Group</h2>
        <div class="library-container-start"></div>
        <div class="hero"><div><div>content</div></div></div>
        <div class="library-metadata"><div><div>searchtags</div><div>mid, group</div></div></div>
        <div class="library-container-end"></div>
      </div></body>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants).to.have.lengthOf(1);
    expect(variants[0].tags).to.equal('mid, group');
    expect(variants[0].dom.querySelector('.library-metadata')).to.be.null;
  });

  it('Pads only the last cell of short rows so no row exceeds maxCols', async () => {
    // A block with one wide row (5 cells) and shorter key/value rows.
    // The old behavior spanned every cell of a short row to maxCols, making
    // those rows wider than the grid and forcing ProseMirror to insert empty
    // cells into every other row.
    mockHtml(`
      <body><div>
        <div class="collection-carousel">
          <div><div>categoryPath</div><div>a</div><div>b</div><div>c</div><div>d</div></div>
          <div><div>maxItems</div><div>8</div></div>
        </div>
      </div></body>
    `);
    const variants = await getBlockVariants('/mock-path');
    const rows = [...variants[0].dom.querySelectorAll('tr')];
    const widths = rows.map((tr) => [...tr.children]
      .reduce((n, td) => n + (parseInt(td.getAttribute('colspan'), 10) || 1), 0));
    // header + wide row + short row, every one exactly maxCols (5) wide
    expect(widths).to.deep.equal([5, 5, 5]);
    // the wide row keeps its 5 cells, the short row keeps exactly 2 (no padding cells)
    expect(rows[1].children).to.have.lengthOf(5);
    expect(rows[2].children).to.have.lengthOf(2);
    // the short row's last cell absorbs the remaining columns
    expect(rows[2].children[1].getAttribute('colspan')).to.equal('4');
  });

  it('Uses library-metadata Name to override the derived name', async () => {
    mockHtml(`
      <body><div>
        <h2>Block Title</h2>
        <div class="hero"><div><div>content</div></div></div>
        <div class="library-metadata"><div><div>name</div><div>Custom Name</div></div></div>
      </div></body>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants[0].name).to.equal('Custom Name');
  });
});

describe('DA Preview Proxy routing', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => {
    window.fetch = savedFetch;
    setDaConfigs([]);
  });

  it('builds the block preview iframe URL on the proxy, not aem.page', () => {
    const details = getItemPreviewUrl(
      { path: 'https://main--proxysite--proxyorg.aem.page/blocks/hero' },
      { org: 'proxyorg', site: 'proxysite' },
    );
    expect(details.previewUrl).to.match(PROXY_HOST);
    expect(details.previewUrl).to.not.include('aem.page');
    expect(details.previewUrl.endsWith('/blocks/hero')).to.be.true;
  });

  it('fetches AEM-hosted variant HTML via the proxy with credentials', async () => {
    const calls = [];
    window.fetch = (url, opts) => {
      calls.push({ url: url.toString(), opts: opts || {} });
      return Promise.resolve(new Response(
        '<body><div><div class="hero"><div><div>content</div></div></div></div></body>',
        { status: 200 },
      ));
    };
    await getBlockVariants('https://main--proxysite--proxyorg.aem.page/blocks/hero', LIBRARY_CONTEXT);
    expect(calls).to.have.lengthOf(1);
    expect(calls[0].url).to.match(PROXY_HOST);
    expect(calls[0].url).to.not.include('aem.page');
    // AEM-hosted content is fetched as `.plain.html`.
    expect(calls[0].url.endsWith('/blocks/hero.plain.html')).to.be.true;
    expect(calls[0].opts.credentials).to.equal('include');
  });

  it('fetches configured library sources via the proxy with credentials', async () => {
    setDaConfigs([{ library: { data: [{ title: 'Blocks', path: '/blocks.json' }] }, data: [] }]);
    const calls = [];
    window.fetch = (url, opts) => {
      calls.push({ url: url.toString(), opts: opts || {} });
      return Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    };
    await loadBlockLibrary('proxyorg', 'proxysite');
    const source = calls.find((c) => c.url.includes('/blocks.json'));
    expect(source, 'block source was fetched').to.exist;
    expect(source.url).to.match(PROXY_HOST);
    expect(source.url).to.not.include('aem.live');
    expect(source.opts.credentials).to.equal('include');
  });

  describe('credentials, cookie and access errors', () => {
    let calls;
    let respond;

    beforeEach(() => {
      resetBlockLibraryCache();
      calls = [];
      respond = () => new Response(JSON.stringify({ data: [] }), { status: 200 });
      window.fetch = (url, opts) => {
        calls.push({ url: url.toString(), opts: opts || {} });
        return Promise.resolve(respond(url.toString()));
      };
    });

    afterEach(() => {
      window.localStorage.removeItem('nx-ims');
      delete window.adobeIMS;
      resetBlockLibraryCache();
    });

    function signIn() {
      window.localStorage.setItem('nx-ims', 'true');
      window.adobeIMS = { getAccessToken: () => ({ token: 'tok' }) };
    }

    it('fetches non-AEM absolute sources without credentials (their CORS is `*`)', async () => {
      await fetchBlocks(['https://example.com/shared/blocks.json']);
      expect(calls).to.have.lengthOf(1);
      expect(calls[0].url).to.equal('https://example.com/shared/blocks.json');
      expect(calls[0].opts.credentials).to.equal(undefined);
    });

    it('rewrites absolute AEM sources to the proxy, keeping the query string', async () => {
      await fetchItems(['https://main--proxysite--proxyorg.aem.live/icons.json?sheet=a'], '', LIBRARY_CONTEXT);
      expect(calls[0].url).to.match(PROXY_HOST);
      expect(calls[0].url.endsWith('/icons.json?sheet=a')).to.be.true;
      expect(calls[0].opts.credentials).to.equal('include');
    });

    it('leaves look-alike hosts that are not exactly branch--site--org on AEM alone', async () => {
      await fetchBlocks(['https://main--proxysite--proxyorg.evilaem.page/blocks.json'], LIBRARY_CONTEXT);
      expect(calls[0].url).to.equal('https://main--proxysite--proxyorg.evilaem.page/blocks.json');
      expect(calls[0].opts.credentials).to.equal(undefined);
    });

    it('authenticates the matching origin before each credentialed request when signed in', async () => {
      signIn();
      await fetchBlocks([
        'https://main--proxysite--proxyorg.aem.page/a.json',
        'https://main--proxysite--proxyorg.aem.page/b.json',
      ], LIBRARY_CONTEXT);
      const urls = calls.map((c) => c.url);
      const proxyGimme = urls.filter((u) => PROXY_HOST.test(u) && u.endsWith('/gimme_cookie'));
      expect(proxyGimme).to.have.lengthOf(2);
      expect(urls.indexOf(proxyGimme[0])).to.be.below(urls.findIndex((u) => u.endsWith('/a.json')));
      expect(urls.lastIndexOf(proxyGimme[1])).to.be.below(urls.findIndex((u) => u.endsWith('/b.json')));
      expect(urls.filter((u) => u.endsWith('.json'))).to.have.lengthOf(2);
    });

    it('does not mint a cookie when signed out', async () => {
      await fetchBlocks(['https://main--proxysite--proxyorg.aem.page/a.json'], LIBRARY_CONTEXT);
      expect(calls.some((c) => c.url.includes('gimme_cookie'))).to.be.false;
    });

    it('flags authError when every source refuses access, and does not cache it', async () => {
      setDaConfigs([{ library: { data: [{ title: 'Blocks', path: '/blocks.json' }] }, data: [] }]);
      respond = () => new Response('', { status: 401 });
      const first = await loadBlockLibrary('proxyorg', 'proxysite');
      expect(first.blocks).to.have.lengthOf(0);
      expect(first.blocks.authError).to.be.true;

      respond = () => new Response(JSON.stringify({ data: [{ name: 'Hero', path: '/hero' }] }), { status: 200 });
      const second = await loadBlockLibrary('proxyorg', 'proxysite');
      expect(second.blocks.map((b) => b.name)).to.deep.equal(['Hero']);
      expect(second.blocks.authError).to.equal(undefined);
    });

    it('does not flag authError for a plain empty library', async () => {
      const items = await fetchItems(['/placeholders.json']);
      expect(items.authError).to.equal(undefined);
    });

    it('retries denied sources even when another source returned valid blocks', async () => {
      setDaConfigs([{ library: { data: [{ title: 'Blocks', path: '/a.json,/b.json' }] }, data: [] }]);
      respond = (url) => (url.endsWith('/b.json') ? new Response('', { status: 403 })
        : new Response(JSON.stringify({ data: [{ name: 'Hero', path: '/hero' }] })));
      const first = await loadBlockLibrary('proxyorg', 'proxysite');
      expect(first.blocks).to.have.lengthOf(1);
      expect(first.blocks.authError).to.be.true;
      respond = () => new Response(JSON.stringify({ data: [{ name: 'Hero', path: '/hero' }] }));
      const second = await loadBlockLibrary('proxyorg', 'proxysite');
      expect(second.blocks).to.have.lengthOf(2);
      expect(second.blocks.authError).to.equal(undefined);
      expect(calls.filter((c) => c.url.endsWith('/b.json'))).to.have.lengthOf(2);
    });

    it('resolves inserted variant images against the public AEM origin, not the proxy', async () => {
      respond = () => new Response(
        '<body><div><div class="hero"><div><div><img src="./media_1.png"></div></div></div></div></body>',
        { status: 200 },
      );
      const [variant] = await getBlockVariants('https://main--proxysite--proxyorg.aem.page/blocks/hero', LIBRARY_CONTEXT);
      const img = variant.dom.querySelector('img');
      expect(img.getAttribute('src')).to.equal('https://main--proxysite--proxyorg.aem.page/media_1.png');
    });

    it('inserts templates from AEM through the proxy', async () => {
      respond = () => new Response('', { status: 404 });
      let error;
      try {
        await insertTemplate(null, 'https://main--proxysite--proxyorg.aem.page/templates/t', LIBRARY_CONTEXT);
      } catch (e) {
        error = e;
      }
      expect(error.message).to.equal('Unable to load template (404).');
      expect(calls[0].url).to.match(PROXY_HOST);
      expect(calls[0].opts.credentials).to.equal('include');
    });

    it('mints the preview cookie before handing back the preview iframe URL', async () => {
      signIn();
      const details = await ensureItemPreviewAccess(
        { path: 'https://main--proxysite--proxyorg.aem.page/blocks/hero' },
        { org: 'proxyorg', site: 'proxysite' },
      );
      expect(details.previewUrl).to.match(PROXY_HOST);
      expect(calls.some((c) => PROXY_HOST.test(c.url) && c.url.endsWith('/gimme_cookie'))).to.be.true;
    });

    it('keeps same-org library sources canonical until they are fetched', async () => {
      setDaConfigs([{ library: { data: [{ title: 'Blocks', path: '/blocks.json' }] }, data: [] }]);
      const [ext] = await fetchExtensions('proxyorg', 'proxysite');
      expect(ext.sources).to.deep.equal(['https://main--proxysite--proxyorg.aem.live/blocks.json']);
    });

    it('leaves cross-org block sources and their variants direct and uncredentialed', async () => {
      signIn();
      respond = (url) => (url.endsWith('.json')
        ? new Response(JSON.stringify({ data: [{ name: 'Hero', path: 'https://feat--shared--other.aem.page/hero' }] }))
        : new Response('<body><div><div class="hero"><div><div>content</div></div></div></div></body>'));
      const blocks = await fetchBlocks(['https://feat--shared--other.aem.live/blocks.json'], LIBRARY_CONTEXT);
      const variants = await blocks[0].loadVariants;
      expect(variants[0].name).to.equal('hero');
      expect(calls.map((c) => c.url)).to.deep.equal([
        'https://feat--shared--other.aem.live/blocks.json',
        'https://feat--shared--other.aem.page/hero.plain.html',
      ]);
      expect(calls.every((c) => c.opts.credentials === undefined)).to.be.true;
    });

    it('passes editor org context from a same-org sheet to cross-org variants', async () => {
      signIn();
      respond = (url) => (url.endsWith('.json')
        ? new Response(JSON.stringify({ data: [{ name: 'Hero', path: 'https://main--shared--other.aem.page/hero' }] }))
        : new Response('<body><div><div class="hero"><div><div>content</div></div></div></div></body>'));
      const blocks = await fetchBlocks(['https://main--proxysite--proxyorg.aem.live/blocks.json'], LIBRARY_CONTEXT);
      await blocks[0].loadVariants;
      expect(calls.filter((c) => c.url.endsWith('/gimme_cookie'))).to.have.lengthOf(1);
      const variant = calls.find((c) => c.url.endsWith('/hero.plain.html'));
      expect(variant.url).to.equal('https://main--shared--other.aem.page/hero.plain.html');
      expect(variant.opts.credentials).to.equal(undefined);
    });

    it('does not proxy AEM sources when the current org is unknown', async () => {
      signIn();
      await fetchBlocks(['https://main--shared--other.aem.live/blocks.json']);
      expect(calls.map((c) => c.url)).to.deep.equal(['https://main--shared--other.aem.live/blocks.json']);
      expect(calls[0].opts.credentials).to.equal(undefined);
    });

    it('leaves cross-org item sheets direct and does not request a cookie', async () => {
      signIn();
      await fetchItems(['https://main--shared--other.aem.live/icons.json'], '', LIBRARY_CONTEXT);
      expect(calls.map((c) => c.url)).to.deep.equal(['https://main--shared--other.aem.live/icons.json']);
      expect(calls[0].opts.credentials).to.equal(undefined);
    });

    it('proxies another site in the same org using its branch and matching cookie origin', async () => {
      signIn();
      await fetchBlocks(['https://feat--shared--proxyorg.aem.live/blocks.json?sheet=a#blocks'], LIBRARY_CONTEXT);
      expect(calls.map((c) => c.url)).to.deep.equal([
        'https://feat--shared--proxyorg.stage-preview.da.live/gimme_cookie',
        'https://feat--shared--proxyorg.stage-preview.da.live/blocks.json?sheet=a#blocks',
      ]);
      expect(calls[1].opts.credentials).to.equal('include');
    });

    it('appends plain.html before query and hash and preserves public image URLs', async () => {
      respond = () => new Response('<body><div><div class="hero"><div><div><img src="./media.png"></div></div></div></div></body>');
      const [variant] = await getBlockVariants('https://feat--shared--proxyorg.aem.page/hero?foo=bar#variants', LIBRARY_CONTEXT);
      expect(calls[0].url).to.equal('https://feat--shared--proxyorg.stage-preview.da.live/hero.plain.html?foo=bar#variants');
      expect(variant.dom.querySelector('img').getAttribute('src')).to.equal('https://feat--shared--proxyorg.aem.page/media.png');
    });

    it('resolves same-org relative variant paths without saving proxy image URLs', async () => {
      respond = () => new Response('<body><div><div class="hero"><div><div><img src="./media.png"></div></div></div></div></body>');
      const [variant] = await getBlockVariants('/hero', LIBRARY_CONTEXT);
      expect(calls[0].url).to.match(PROXY_HOST);
      expect(calls[0].url.endsWith('/hero.plain.html')).to.be.true;
      expect(variant.dom.querySelector('img').getAttribute('src')).to.equal('https://main--proxysite--proxyorg.aem.live/media.png');
    });

    it('retries proxy login and content after a rejected cookie exchange', async () => {
      signIn();
      setDaConfigs([{ library: { data: [{ title: 'Blocks', path: '/blocks.json' }] }, data: [] }]);
      respond = () => new Response('', { status: 403 });
      const first = await loadBlockLibrary('proxyorg', 'proxysite');
      expect(first.blocks.authError).to.be.true;
      respond = () => new Response(JSON.stringify({ data: [] }));
      const second = await loadBlockLibrary('proxyorg', 'proxysite');
      expect(second.blocks.authError).to.equal(undefined);
      expect(calls.filter((c) => c.url.endsWith('/gimme_cookie'))).to.have.lengthOf(2);
    });

    it('does not cache denied variant HTML as a successful empty variant list', async () => {
      setDaConfigs([{ library: { data: [{ title: 'Blocks', path: '/blocks.json' }] }, data: [] }]);
      respond = (url) => (url.endsWith('.json')
        ? new Response(JSON.stringify({ data: [{ name: 'Hero', path: 'https://main--proxysite--proxyorg.aem.page/hero' }] }))
        : new Response('', { status: 403 }));
      const first = await loadBlockLibrary('proxyorg', 'proxysite');
      expect((await first.blocks[0].loadVariants).authError).to.be.true;
      respond = (url) => (url.endsWith('.json')
        ? new Response(JSON.stringify({ data: [{ name: 'Hero', path: 'https://main--proxysite--proxyorg.aem.page/hero' }] }))
        : new Response('<body><div><div class="hero"><div><div>content</div></div></div></div></body>'));
      const second = await loadBlockLibrary('proxyorg', 'proxysite');
      expect(await second.blocks[0].loadVariants).to.have.lengthOf(1);
      expect(calls.filter((c) => c.url.endsWith('/blocks.json'))).to.have.lengthOf(2);
    });

    it('routes options and editor sheets through the same-org proxy', async () => {
      signIn();
      resetBlockOptionsCache();
      setDaConfigs([{ library: { data: [{ title: 'Blocks', path: '/blocks.json' }] }, data: [] }]);
      respond = () => new Response(JSON.stringify({
        options: { data: [{ key: 'hero', value: 'wide' }] },
        editor: { data: [{ key: 'hero', value: 'example' }] },
      }));
      expect(await loadBlockOptions('proxyorg', 'proxysite')).to.deep.equal([{ key: 'hero', value: 'wide' }]);
      expect(await loadBlockEditor('proxyorg', 'proxysite')).to.deep.equal([{ key: 'hero', value: 'example' }]);
      expect(calls.filter((c) => c.url.endsWith('/blocks.json')).every((c) => PROXY_HOST.test(c.url) && c.opts.credentials === 'include')).to.be.true;
      resetBlockOptionsCache();
    });

    it('leaves cross-org options sheets direct and retries access failures', async () => {
      signIn();
      resetBlockOptionsCache();
      setDaConfigs([{ library: { data: [{ title: 'Blocks', path: 'https://main--shared--other.aem.live/blocks.json' }] }, data: [] }]);
      respond = () => new Response('', { status: 403 });
      expect(await loadBlockOptions('proxyorg', 'proxysite')).to.deep.equal([]);
      respond = () => new Response(JSON.stringify({ options: { data: [{ key: 'hero', value: 'wide' }] } }));
      expect(await loadBlockOptions('proxyorg', 'proxysite')).to.deep.equal([{ key: 'hero', value: 'wide' }]);
      expect(calls.map((c) => c.url)).to.deep.equal([
        'https://main--shared--other.aem.live/blocks.json',
        'https://main--shared--other.aem.live/blocks.json',
      ]);
      expect(calls.every((c) => c.opts.credentials === undefined)).to.be.true;
      resetBlockOptionsCache();
    });

    it('keeps cross-org template fetches direct and surfaces access denial', async () => {
      signIn();
      respond = () => new Response('', { status: 403 });
      let error;
      try {
        await insertTemplate(null, 'https://main--shared--other.aem.live/templates/t', LIBRARY_CONTEXT);
      } catch (e) {
        error = e;
      }
      expect(error.message).to.include('Library access was denied');
      expect(calls.map((c) => c.url)).to.deep.equal(['https://main--shared--other.aem.live/templates/t']);
      expect(calls[0].opts.credentials).to.equal(undefined);
    });

    it('keeps cross-org previews unchanged without requesting a cookie', async () => {
      signIn();
      const path = 'https://feat--shared--other.aem.page/hero?foo=bar#variants';
      const details = await ensureItemPreviewAccess({ path }, LIBRARY_CONTEXT);
      expect(details).to.deep.equal({ previewUrl: path, org: 'other', site: 'shared', pathname: '/hero' });
      expect(calls).to.have.lengthOf(0);
    });

    it('keeps unrelated and lookalike preview URLs unchanged', async () => {
      signIn();
      const path = 'https://content.da.live.example.com/proxyorg/proxysite/hero';
      expect((await ensureItemPreviewAccess({ path }, LIBRARY_CONTEXT)).previewUrl).to.equal(path);
      expect(calls).to.have.lengthOf(0);
    });

    it('routes same-org DA content previews using the shared parser', async () => {
      signIn();
      const details = await ensureItemPreviewAccess({ value: 'https://content.da.live/proxyorg/proxysite/templates/home?foo=bar#preview' }, LIBRARY_CONTEXT);
      expect(details.previewUrl).to.equal('https://main--proxysite--proxyorg.stage-preview.da.live/templates/home?foo=bar#preview');
      expect(calls.map((c) => c.url)).to.deep.equal(['https://main--proxysite--proxyorg.stage-preview.da.live/gimme_cookie']);
    });
  });
});

describe('extensionToPanelView', () => {
  it('gives the "blocks" extension a dedicated modal experience', () => {
    const ext = { name: 'blocks', title: 'Blocks', ootb: true, icon: '#icon-blocks' };
    const view = extensionToPanelView(ext, 'Library');
    expect(view.id).to.equal('blocks');
    expect(view.label).to.equal('Blocks');
    expect(view.section).to.equal('Library');
    expect(view.firstParty).to.be.true;
    expect(view.experience).to.equal('modal');
    expect(view.icon).to.equal('#icon-blocks');
    expect(view.openModal).to.be.a('function');
    // The modal view opts out of the generic inline-panel loader.
    expect(view.load).to.be.undefined;
  });

  it('leaves non-blocks extensions on the standard inline/load experience', () => {
    const ext = {
      name: 'templates', title: 'Templates', ootb: true, experience: 'inline', sources: ['/tpl'], icon: '',
    };
    const view = extensionToPanelView(ext, 'Library');
    expect(view.id).to.equal('templates');
    expect(view.experience).to.equal('inline');
    expect(view.cacheKey).to.be.undefined;
    expect(view.load).to.be.a('function');
    expect(view.openModal).to.be.undefined;
  });

  it('gives configured extensions a source cache key', () => {
    const ext = { name: 'configured-tool', title: 'Configured tool', experience: 'inline', sources: ['/tool'], icon: '' };
    expect(extensionToPanelView(ext, 'Extensions').cacheKey).to.equal('["/tool"]');
  });

  it('routes configured extension sources and icons through the DA preview proxy', () => {
    const ext = {
      name: 'configured-tool',
      title: 'Configured tool',
      experience: 'inline',
      sources: ['https://main--repo--org.aem.live/tools/plugins/tool/index.html'],
      icon: 'https://main--repo--org.aem.live/tools/plugins/tool/icon.svg',
    };
    const view = extensionToPanelView(ext, 'Extensions');
    expect(view.sources).to.deep.equal(['https://main--repo--org.stage-preview.da.live/tools/plugins/tool/index.html']);
    expect(view.icon).to.equal('https://main--repo--org.stage-preview.da.live/tools/plugins/tool/icon.svg');
  });

  it('leaves extension sources and icons from another org unproxied', () => {
    const ext = {
      name: 'configured-tool',
      title: 'Configured tool',
      experience: 'inline',
      org: 'org',
      sources: ['https://main--repo--other.aem.live/tools/plugins/tool/index.html'],
      icon: 'https://main--repo--other.aem.live/tools/plugins/tool/icon.svg',
    };
    const view = extensionToPanelView(ext, 'Extensions');
    expect(view.sources).to.deep.equal(['https://main--repo--other.aem.live/tools/plugins/tool/index.html']);
    expect(view.icon).to.equal('https://main--repo--other.aem.live/tools/plugins/tool/icon.svg');
  });

  it('leaves window extension sources unproxied so sidekick handles auth', () => {
    const ext = {
      name: 'configured-tool',
      title: 'Configured tool',
      experience: 'window',
      org: 'org',
      sources: ['https://main--repo--org.aem.live/tools/plugins/tool/index.html'],
    };
    const view = extensionToPanelView(ext, 'Extensions');
    expect(view.sources).to.deep.equal(['https://main--repo--org.aem.live/tools/plugins/tool/index.html']);
  });

  it('authenticates the same preview proxy origin the fullsize-dialog iframe will load', async () => {
    const savedAdobeIMS = window.adobeIMS;
    const savedNxIms = window.localStorage.getItem('nx-ims');
    window.localStorage.setItem('nx-ims', 'true');
    window.adobeIMS = { getAccessToken: () => ({ token: 'T1' }) };
    const savedFetch = window.fetch;
    const cookieRequests = [];
    window.fetch = async (url, opts) => {
      if (typeof url === 'string' && url.includes('/gimme_cookie')) {
        cookieRequests.push(url);
        return new Response('', { status: 200 });
      }
      return savedFetch(url, opts);
    };

    const ext = {
      name: 'configured-tool',
      title: 'Configured tool',
      experience: 'fullsize-dialog',
      sources: ['https://main--siteg--orgg.aem.live/tools/plugins/tool/index.html'],
    };
    const view = extensionToPanelView(ext, 'Extensions');
    const container = document.createElement('div');

    try {
      await view.loadModal(container, () => {});
    } finally {
      window.fetch = savedFetch;
      if (savedAdobeIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedAdobeIMS;
      if (savedNxIms === null) window.localStorage.removeItem('nx-ims');
      else window.localStorage.setItem('nx-ims', savedNxIms);
    }

    expect(cookieRequests).to.deep.equal([
      'https://main--siteg--orgg.stage-preview.da.live/gimme_cookie',
    ]);
  });
});

describe('getPreviewStatus', () => {
  let savedFetch;

  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => {
    window.fetch = savedFetch;
    window.localStorage.removeItem('hlx6-upgrade');
  });

  it('returns true when preview status is 200', async () => {
    window.fetch = () => Promise.resolve(new Response(
      JSON.stringify({ preview: { status: 200 } }),
      { status: 200 },
    ));
    const result = await getPreviewStatus({ org: 'pstatusorg', site: 'pstatussite', pathname: '/p' });
    expect(result).to.be.true;
  });

  it('returns false when preview status is not 200', async () => {
    window.fetch = () => Promise.resolve(new Response(
      JSON.stringify({ preview: { status: 404 } }),
      { status: 200 },
    ));
    const result = await getPreviewStatus({ org: 'pstatusorg2', site: 'pstatussite2', pathname: '/p' });
    expect(result).to.be.false;
  });

  it('returns null when the status call fails', async () => {
    window.fetch = () => Promise.resolve(new Response('{}', { status: 500 }));
    const result = await getPreviewStatus({ org: 'pstatusorg3', site: 'pstatussite3', pathname: '/p' });
    expect(result).to.equal(null);
  });
});

describe('createCommentsView', () => {
  afterEach(() => setCommentsController(null));

  it('is a first-party Editor-section view', () => {
    const view = createCommentsView();
    expect(view.id).to.equal('comments');
    expect(view.section).to.equal('Editor');
    expect(view.firstParty).to.equal(true);
  });

  it('getLabel() shows the active thread count when comments exist', () => {
    setCommentsController({ counts: { active: 20, resolved: 3 } });
    expect(createCommentsView().getLabel()).to.equal('Comments (20)');
  });

  it('getLabel() omits the count when there are no active comments', () => {
    setCommentsController({ counts: { active: 0, resolved: 3 } });
    expect(createCommentsView().getLabel()).to.equal('Comments');
    setCommentsController(null);
    expect(createCommentsView().getLabel()).to.equal('Comments');
  });

  it('load() returns an ew-comments element that binds to the current controller', async () => {
    const controller = {
      subscribe() { return () => {}; },
      getCurrentUser() { return null; },
      onCurrentUserChange() { return () => {}; },
      setPanelOpen() {},
    };
    setCommentsController(controller);
    const el = await createCommentsView().load();
    expect(el.localName).to.equal('ew-comments');
    document.body.append(el);
    expect(el.controller).to.equal(controller);
    el.remove();
  });
});

describe('ew-comments panel visibility', () => {
  let el;

  const stubController = (calls) => ({
    subscribe() { return () => {}; },
    getCurrentUser() { return null; },
    onCurrentUserChange() { return () => {}; },
    setPanelOpen(value) { calls.push(value); },
  });

  const mount = async (calls) => {
    setCommentsController(stubController(calls));
    el = await createCommentsView().load();
    document.body.append(el);
    await el.updateComplete;
  };

  afterEach(() => {
    el?.remove();
    el = null;
    setCommentsController(null);
  });

  it('opens when comments is the active tool view', async () => {
    const calls = [];
    await mount(calls);
    canvasBus.toolPanelViewState.emit('comments');
    expect(calls.at(-1)).to.equal(true);
  });

  it('closes when another view is active or the rail is closed', async () => {
    const calls = [];
    await mount(calls);
    canvasBus.toolPanelViewState.emit('comments');
    canvasBus.toolPanelViewState.emit('versions');
    expect(calls.at(-1)).to.equal(false);
    canvasBus.toolPanelViewState.emit('comments');
    canvasBus.toolPanelViewState.emit(null);
    expect(calls.at(-1)).to.equal(false);
  });

  it('re-applies visibility to a swapped-in controller', async () => {
    const first = [];
    await mount(first);
    canvasBus.toolPanelViewState.emit('comments');
    expect(first.at(-1)).to.equal(true);

    const second = [];
    setCommentsController(stubController(second));
    await el.updateComplete;
    expect(second.at(-1)).to.equal(true);
  });
});

describe('createMetadataView', () => {
  it('is a first-party Editor-section view', () => {
    const view = createMetadataView();
    expect(view.id).to.equal('metadata');
    expect(view.label).to.equal('Page');
    expect(view.section).to.equal('Editor');
    expect(view.firstParty).to.equal(true);
  });

  it('load() returns an ew-page-metadata element', async () => {
    const el = await createMetadataView().load();
    expect(el.localName).to.equal('ew-page-metadata');
  });
});

describe('getCanvasToolPanelViews', () => {
  afterEach(() => setDaConfigs([]));

  it('includes the metadata view alongside the other first-party Editor views', async () => {
    setDaConfigs([{ data: [] }]);
    const views = await getCanvasToolPanelViews({ org: 'org', site: 'site' });
    expect(views.map((v) => v.id)).to.include('metadata');
  });
});

describe('EW panel helpers fetchExtensions', () => {
  const REPO = { key: 'aem.repositoryId', value: 'author-p1-e1.adobeaemcloud.com' };
  const blocksRow = { title: 'Blocks', path: '/blocks.json' };

  afterEach(() => setDaConfigs([]));

  it('loads the AEM assets panel when configured without a library sheet', async () => {
    setDaConfigs([{ data: [REPO] }]);
    const names = (await fetchExtensions('org', 'site')).map((e) => e.name);
    expect(names).to.include('aem-assets');
  });

  it('loads the AEM assets panel alongside configured library tools', async () => {
    setDaConfigs([{ library: { data: [blocksRow] }, data: [REPO] }]);
    const names = (await fetchExtensions('org', 'site')).map((e) => e.name);
    expect(names).to.include('blocks');
    expect(names).to.include('aem-assets');
  });

  it('omits the AEM assets panel when no repository is configured', async () => {
    setDaConfigs([{ library: { data: [blocksRow] }, data: [] }]);
    const names = (await fetchExtensions('org', 'site')).map((e) => e.name);
    expect(names).to.include('blocks');
    expect(names).to.not.include('aem-assets');
  });

  it('returns an empty list when there are no valid configs', async () => {
    setDaConfigs([{ error: true }]);
    expect(await fetchExtensions('org', 'site')).to.eql([]);
  });
});
