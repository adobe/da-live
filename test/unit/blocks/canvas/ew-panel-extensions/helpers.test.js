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
});

describe('library preview branch state', () => {
  const state = { org: 'org', site: 'site', path: '/org/site/page' };
  const item = { path: 'https://content.da.live/org/site/blocks/hero' };
  afterEach(() => canvasBus.branchState.emit({ path: null, status: 'pending' }));

  it('uses the configured canvas branch rather than a snapshotted query ref', () => {
    canvasBus.branchState.emit({ ...state, status: 'ready', branch: 'Configured/Branch' });
    expect(getItemPreviewUrl(item, state).previewUrl)
      .to.equal('https://configured-branch--site--org.aem.page/blocks/hero');
  });

  ['pending', 'error'].forEach((status) => {
    it(`does not build a main-branch URL while branch state is ${status}`, () => {
      canvasBus.branchState.emit({ ...state, status });
      expect(getItemPreviewUrl(item, state)).to.equal(null);
    });
  });

  it('does not use state belonging to a different site', () => {
    canvasBus.branchState.emit({ ...state, site: 'different', status: 'ready', branch: 'wrong' });
    expect(getItemPreviewUrl(item, state)).to.equal(null);
  });
});

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

  it('Preserves distinct heading IDs for variants, including metadata name overrides', async () => {
    mockHtml(`
      <main><div>
        <h2 id="first-variant">Same title</h2>
        <div class="hero"><div><div>first</div></div></div>
        <h2 id="second-variant">Same title</h2>
        <div class="library-metadata"><div><div>name</div><div>Custom name</div></div></div>
        <div class="hero"><div><div>second</div></div></div>
      </div></main>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants.map((v) => v.anchor)).to.deep.equal(['first-variant', 'second-variant']);
    expect(variants[1].name).to.equal('Custom name');
  });

  it('Uses the AEM heading slug when source HTML omits the ID', async () => {
    mockHtml(`
      <main><div>
        <h3> Hero: Wide &amp; Bright! </h3>
        <div class="hero"><div><div>content</div></div></div>
      </div></main>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants[0].anchor).to.equal('hero-wide--bright');
  });

  [
    ['Cards &amp; Tabs', 'cards--tabs'],
    ['2 Columns', 'columns'],
    ['Über', 'über'],
    ['中文', '中文'],
    ['Tabs_with_underscores', 'tabs_with_underscores'],
    ['2026', '2026'],
  ].forEach(([heading, anchor]) => {
    it(`Matches AEM's heading slug for "${heading}"`, async () => {
      mockHtml(`
        <main><div>
          <h2>${heading}</h2>
          <div class="hero"><div><div>content</div></div></div>
        </div></main>
      `);
      const variants = await getBlockVariants('/mock-path');
      expect(variants[0].anchor).to.equal(anchor);
    });
  });

  it('Assigns unique anchors to repeated variant headings', async () => {
    mockHtml(`
      <main><div>
        <h2>Default</h2>
        <div class="hero"><div><div>first</div></div></div>
        <h2>Default</h2>
        <div class="hero"><div><div>second</div></div></div>
      </div></main>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants.map((v) => v.anchor)).to.deep.equal(['default', 'default-1']);
  });

  it('Counts all heading levels across sections and inside groups in document order', async () => {
    mockHtml(`
      <main>
        <div>
          <h1>Default</h1>
          <p>This heading does not label a variant.</p>
          <h2>Default</h2>
          <div class="hero"><div><div>first</div></div></div>
        </div>
        <div>
          <h3>Default</h3>
          <div class="library-container-start"></div>
          <div class="hero"><div><div><h4>Default</h4>group content</div></div></div>
          <div class="library-container-end"></div>
        </div>
        <div>
          <h5>Default</h5>
          <div class="hero"><div><div>third</div></div></div>
          <h6>Default</h6>
          <div class="hero"><div><div>fourth</div></div></div>
        </div>
      </main>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants.map((v) => v.anchor))
      .to.deep.equal(['default-1', 'default-2', 'default-4', 'default-5']);
  });

  it('Resolves collisions after removing leading numeric prefixes', async () => {
    mockHtml(`
      <main><div>
        <h2>1. Goals</h2>
        <div class="hero"><div><div>first</div></div></div>
        <h2>2. Goals</h2>
        <div class="hero"><div><div>second</div></div></div>
        <h2>Goals</h2>
        <div class="hero"><div><div>third</div></div></div>
      </div></main>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants.map((v) => v.anchor)).to.deep.equal(['goals', 'goals-1', 'goals-2']);
  });

  it('Avoids collisions with headings that already contain numeric suffixes', async () => {
    mockHtml(`
      <main><div>
        <h2>Default</h2>
        <div class="hero"><div><div>first</div></div></div>
        <h2>Default-1</h2>
        <div class="hero"><div><div>second</div></div></div>
        <h2>Default</h2>
        <div class="hero"><div><div>third</div></div></div>
        <h2>Default-1</h2>
        <div class="hero"><div><div>fourth</div></div></div>
      </div></main>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants.map((v) => v.anchor))
      .to.deep.equal(['default', 'default-1', 'default-2', 'default-1-1']);
  });

  it('Preserves existing IDs without consuming generated-heading counters', async () => {
    mockHtml(`
      <main><div>
        <h2 id="existing-default">Default</h2>
        <div class="hero"><div><div>first</div></div></div>
        <h2>Default</h2>
        <div class="hero"><div><div>second</div></div></div>
        <h2>Default</h2>
        <div class="hero"><div><div>third</div></div></div>
      </div></main>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants.map((v) => v.anchor))
      .to.deep.equal(['existing-default', 'default', 'default-1']);
  });

  it('Keeps generated anchors independent of metadata name overrides', async () => {
    mockHtml(`
      <main><div>
        <h2>Default</h2>
        <div class="library-metadata"><div><div>name</div><div>Custom name</div></div></div>
        <div class="hero"><div><div>first</div></div></div>
        <h2>Default</h2>
        <div class="hero"><div><div>second</div></div></div>
      </div></main>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants[0].name).to.equal('Custom name');
    expect(variants.map((v) => v.anchor)).to.deep.equal(['default', 'default-1']);
  });

  it('Resets heading counters for each parsed document', async () => {
    mockHtml(`
      <main><div>
        <h2>Default</h2>
        <div class="hero"><div><div>first</div></div></div>
        <h2>Default</h2>
        <div class="hero"><div><div>second</div></div></div>
      </div></main>
    `);
    const results = await Promise.all([
      getBlockVariants('/first-library'),
      getBlockVariants('/second-library'),
    ]);
    results.forEach((variants) => {
      expect(variants.map((v) => v.anchor)).to.deep.equal(['default', 'default-1']);
    });
  });

  it('Leaves whitespace-only headings without navigation anchors', async () => {
    mockHtml(`
      <main><div>
        <h2>   </h2>
        <div class="hero"><div><div>content</div></div></div>
      </div></main>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants).to.have.lengthOf(1);
    expect(variants[0].anchor).to.be.undefined;
  });

  it('Preserves the heading anchor preceding a library group', async () => {
    mockHtml(`
      <main><div>
        <h2 id="group-preview">My Group</h2>
        <div class="library-container-start"></div>
        <div class="hero"><div><div>content</div></div></div>
        <div class="library-container-end"></div>
        <div class="library-metadata"><div><div>name</div><div>Group name</div></div></div>
      </div></main>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants[0].anchor).to.equal('group-preview');
    expect(variants[0].name).to.equal('Group name');
    expect(variants[0].dom.querySelector('h2')).to.be.null;
  });

  it('Does not invent anchors for variants with only library metadata', async () => {
    mockHtml(`
      <main><div>
        <div class="quote"><div><div>content</div></div></div>
        <div class="library-metadata"><div><div>name</div><div>Quote</div></div></div>
      </div></main>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants[0].anchor).to.be.undefined;
    expect(variants[0].name).to.equal('Quote');
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
