import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getBlockVariants;
let extensionToPanelView;
let getItemPreviewUrl;
let buildIsolatedPreviewHtml;
let getIsolatedPreviewHtml;
let resetSiteHeadCache;

before(async () => {
  const mod = await import('../../../../../blocks/canvas/ew-panel-extensions/helpers.js');
  getBlockVariants = mod.getBlockVariants;
  extensionToPanelView = mod.extensionToPanelView;
  getItemPreviewUrl = mod.getItemPreviewUrl;
  buildIsolatedPreviewHtml = mod.buildIsolatedPreviewHtml;
  getIsolatedPreviewHtml = mod.getIsolatedPreviewHtml;
  resetSiteHeadCache = mod.resetSiteHeadCache;
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

  it('item.rawDom matches the metadata-stripped content for a single block', async () => {
    mockHtml(`
      <body><div>
        <div class="hero"><div><div>content</div></div></div>
        <div class="library-metadata"><div><div>searchtags</div><div>hero, card</div></div></div>
      </div></body>
    `);
    const variants = await getBlockVariants('/mock-path');
    expect(variants[0].rawDom.querySelector('.library-metadata')).to.be.null;
    expect(variants[0].rawDom.className).to.contain('hero');
  });

  it('item.rawDom matches the metadata-stripped content for a group', async () => {
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
    expect(variants[0].rawDom.querySelector('.library-metadata')).to.be.null;
    expect(variants[0].rawDom.querySelector('.hero')).to.not.be.null;
  });
});

describe('getItemPreviewUrl', () => {
  it('builds a DA preview-proxy URL (not the raw aem-hosted origin) from an item path', () => {
    const item = { path: 'https://main--library--acme.aem.page/blocks/hero' };
    const details = getItemPreviewUrl(item, { org: 'fallback-org', site: 'fallback-site' });
    expect(details.org).to.equal('acme');
    expect(details.site).to.equal('library');
    expect(details.pathname).to.equal('/blocks/hero');
    // aem.page's CDN doesn't allow cross-origin fetch of full pages (only
    // .plain.html), so previews are routed through DA's own preview proxy,
    // which sends permissive CORS headers for this app's origin.
    expect(details.previewUrl).to.not.contain('.aem.page');
    expect(details.previewUrl).to.contain('main--library--acme.');
    expect(details.previewUrl).to.contain('/blocks/hero');
  });
});

describe('buildIsolatedPreviewHtml', () => {
  it('wraps a single block in one extra section div, directly under main', () => {
    const rawDom = document.createElement('div');
    rawDom.className = 'hero';
    rawDom.innerHTML = '<div><div>content</div></div>';
    const html = buildIsolatedPreviewHtml({
      rawDom,
      headHtml: '<link rel="stylesheet" href="/styles/styles.css">',
      origin: 'https://main--site--org.aem.page',
    });
    expect(html).to.contain('<base href="https://main--site--org.aem.page/">');
    expect(html).to.contain('/styles/styles.css');
    expect(html).to.contain('<header></header>');
    expect(html).to.contain('<footer></footer>');

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const main = doc.querySelector('main');
    // decorateSections() only recognizes main's own direct children as
    // sections, so the block itself must sit one level deeper.
    expect(main.children).to.have.lengthOf(1);
    expect(main.firstElementChild.tagName).to.equal('DIV');
    expect(main.firstElementChild.firstElementChild.className).to.equal('hero');
  });

  it('unwraps a group so each of its blocks sits directly in the section, not nested under the group container', () => {
    const rawDom = document.createElement('div');
    rawDom.dataset.isgroup = 'true';
    const blockA = document.createElement('div');
    blockA.className = 'hero';
    const blockB = document.createElement('div');
    blockB.className = 'cards';
    rawDom.append(blockA, blockB);

    const html = buildIsolatedPreviewHtml({
      rawDom,
      headHtml: '',
      origin: 'https://main--site--org.aem.page',
    });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const section = doc.querySelector('main > div');
    expect(section.children).to.have.lengthOf(2);
    expect(section.children[0].className).to.equal('hero');
    expect(section.children[1].className).to.equal('cards');
  });
});

describe('getIsolatedPreviewHtml', () => {
  let savedFetch;
  beforeEach(() => {
    savedFetch = window.fetch;
    resetSiteHeadCache();
  });
  afterEach(() => { window.fetch = savedFetch; });

  it('builds isolated preview html using the fetched page head', async () => {
    window.fetch = () => Promise.resolve(new Response(
      '<html><head><link rel="stylesheet" href="/styles/styles.css"></head><body></body></html>',
      { status: 200 },
    ));
    const rawDom = document.createElement('div');
    rawDom.className = 'hero';
    const previewDetails = { previewUrl: 'https://main--site--org.preview.da.live/some-page', org: 'org', site: 'site' };
    const html = await getIsolatedPreviewHtml({ rawDom }, previewDetails);
    expect(html).to.contain('/styles/styles.css');
    expect(html).to.contain('class="hero"');
    expect(html).to.contain('<base href="https://main--site--org.preview.da.live/">');
  });

  it('returns null when the item has no rawDom', async () => {
    const previewDetails = { previewUrl: 'https://main--site--org.preview.da.live/some-page', org: 'org', site: 'site' };
    const html = await getIsolatedPreviewHtml({}, previewDetails);
    expect(html).to.be.null;
  });

  it('returns null when the head fetch fails', async () => {
    window.fetch = () => Promise.resolve(new Response('error', { status: 500 }));
    const rawDom = document.createElement('div');
    const previewDetails = { previewUrl: 'https://main--other--org2.preview.da.live/some-page', org: 'org2', site: 'other' };
    const html = await getIsolatedPreviewHtml({ rawDom }, previewDetails);
    expect(html).to.be.null;
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
    expect(view.load).to.be.a('function');
    expect(view.openModal).to.be.undefined;
  });
});
