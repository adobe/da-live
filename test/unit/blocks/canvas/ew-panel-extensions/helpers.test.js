import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { setCommentsController } from '../../../../../blocks/canvas/editor-utils/comments-bridge.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getBlockVariants;
let extensionToPanelView;
let createCommentsView;
let bindPanelOpenToVisibility;

before(async () => {
  const mod = await import('../../../../../blocks/canvas/ew-panel-extensions/helpers.js');
  getBlockVariants = mod.getBlockVariants;
  extensionToPanelView = mod.extensionToPanelView;
  createCommentsView = mod.createCommentsView;
  bindPanelOpenToVisibility = mod.bindPanelOpenToVisibility;
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

  it('load() returns an ew-comments element bound to the current controller', async () => {
    const controller = {
      subscribe() { return () => {}; },
      getCurrentUser() { return null; },
      setPanelOpen() {},
    };
    setCommentsController(controller);
    const el = await createCommentsView().load();
    expect(el.localName).to.equal('ew-comments');
    expect(el.controller).to.equal(controller);
  });

  it('rebinds the element when the controller changes', async () => {
    const el = await createCommentsView().load();
    const next = {
      subscribe() { return () => {}; },
      getCurrentUser() { return null; },
      setPanelOpen() {},
    };
    setCommentsController(next);
    expect(el.controller).to.equal(next);
  });
});

describe('bindPanelOpenToVisibility', () => {
  let realIntersectionObserver;
  let fireIntersection;

  beforeEach(() => {
    realIntersectionObserver = window.IntersectionObserver;
    let callback;
    window.IntersectionObserver = class {
      constructor(cb) { callback = cb; }

      observe() {}

      disconnect() {}
    };
    fireIntersection = (isIntersecting) => callback([{ isIntersecting }]);
  });

  afterEach(() => { window.IntersectionObserver = realIntersectionObserver; });

  it('opens the panel when visible and closes it when hidden', async () => {
    const calls = [];
    const controller = { setPanelOpen(value) { calls.push(value); } };
    const el = document.createElement('div');

    bindPanelOpenToVisibility(el, () => controller);

    fireIntersection(true);
    expect(calls.at(-1)).to.equal(true);

    fireIntersection(false);
    // Hiding is debounced (see bindPanelOpenToVisibility); wait for the timer.
    await new Promise((resolve) => { setTimeout(resolve, 200); });
    expect(calls.at(-1)).to.equal(false);
  });

  it('re-applies the current visibility to a swapped-in controller', () => {
    const first = [];
    const second = [];
    let controller = { setPanelOpen(value) { first.push(value); } };
    const el = document.createElement('div');

    const syncPanelOpen = bindPanelOpenToVisibility(el, () => controller);
    fireIntersection(true);
    expect(first.at(-1)).to.equal(true);

    controller = { setPanelOpen(value) { second.push(value); } };
    syncPanelOpen();
    expect(second.at(-1)).to.equal(true);
  });
});
