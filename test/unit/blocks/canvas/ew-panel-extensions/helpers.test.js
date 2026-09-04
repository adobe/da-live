import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { setCommentsController } from '../../../../../blocks/canvas/editor-utils/comments-bridge.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getBlockVariants;
let extensionToPanelView;
let getPreviewStatus;
let createCommentsView;

before(async () => {
  const mod = await import('../../../../../blocks/canvas/ew-panel-extensions/helpers.js');
  getBlockVariants = mod.getBlockVariants;
  extensionToPanelView = mod.extensionToPanelView;
  getPreviewStatus = mod.getPreviewStatus;
  createCommentsView = mod.createCommentsView;
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
    expect(view.load).to.be.a('function');
    expect(view.openModal).to.be.undefined;
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
