import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getBlockVariants;

before(async () => {
  const mod = await import('../../../../../blocks/canvas/ew-panel-extensions/helpers.js');
  getBlockVariants = mod.getBlockVariants;
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
});
