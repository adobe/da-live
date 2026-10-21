import { expect } from '@esm-bundle/chai';
import {
  EditorState, NodeSelection, TextSelection, prosemirrorToYDoc, yDocToProsemirror,
  ySyncPlugin, yUndoPlugin, yUndo,
} from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';
import { setCommentsController } from '../../../../../blocks/canvas/editor-utils/comments-bridge.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
import { setDaConfigs } from '../../../../fixtures/nx/utils/daConfig.js';
import { makeRealView } from '../test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getBlockVariants;
let extensionToPanelView;
let getPreviewStatus;
let createCommentsView;
let createMetadataView;
let getCanvasToolPanelViews;
let fetchExtensions;
let getItemPreviewUrl;
let insertBlock;
let insertHTML;
let replaceHTMLAtCursor;

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
  insertBlock = mod.insertBlock;
  insertHTML = mod.insertHTML;
  replaceHTMLAtCursor = mod.replaceHTMLAtCursor;
});

describe('sendHTML replacement targets', () => {
  const paragraph = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
  const table = {
    type: 'table',
    content: [
      { type: 'table_row', content: [{ type: 'table_cell', content: [paragraph('Hero')] }] },
      { type: 'table_row', content: [{ type: 'table_cell', content: [paragraph('Original title')] }] },
    ],
  };
  let view;
  beforeEach(() => {
    view = makeRealView({
      type: 'doc',
      content: [
        paragraph('Intro'), table,
        { type: 'bullet_list', content: [{ type: 'list_item', content: [paragraph('Item')] }] },
        { type: 'paragraph', content: [{ type: 'image', attrs: { src: '/old.png' } }] },
        paragraph('Outro'),
      ],
    });
  });
  afterEach(() => {
    const mount = view.dom.parentElement;
    view.destroy();
    mount?.remove();
  });
  const caret = (text, offset = 1) => {
    let pos;
    view.state.doc.descendants((node, start) => {
      if (node.isText && node.text === text) pos = start + offset;
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
    return pos;
  };
  it('replaces an EDS block and preserves a caret inside unchanged content without focusing the host', () => {
    const pos = caret('Original title', 4);
    const before = view.state.doc.child(0);
    const after = view.state.doc.lastChild;
    const focused = document.activeElement;
    replaceHTMLAtCursor(view, '<div class="hero wide"><div><div><p>Original title</p></div></div></div>');
    expect(view.state.doc.child(1).type.name).to.equal('table');
    expect(view.state.doc.child(1).textContent).to.equal('hero (wide)Original title');
    expect(view.state.selection.from).to.equal(pos + ' (wide)'.length);
    expect(view.state.doc.firstChild).to.equal(before);
    expect(view.state.doc.lastChild).to.equal(after);
    expect(document.activeElement).to.equal(focused);
  });
  it('replaces a paragraph, preserving a range when content before it changes', () => {
    caret('Intro', 3);
    const pos = view.state.selection.from;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos, pos + 1)));
    replaceHTMLAtCursor(view, '<p>New Intro</p>');
    expect(view.state.doc.firstChild.textContent).to.equal('New Intro');
    expect(view.state.selection.anchor).to.equal(pos + 4);
    expect(view.state.selection.head).to.equal(pos + 5);
  });
  it('replaces the whole list rather than its inner paragraph or list item', () => {
    caret('Item');
    replaceHTMLAtCursor(view, '<ul><li>First</li><li>Second</li></ul>');
    expect(view.state.doc.child(2).type.name).to.equal('bullet_list');
    expect(view.state.doc.child(2).childCount).to.equal(2);
  });
  it('replaces a selected inline image without replacing its paragraph', () => {
    let pos;
    view.state.doc.descendants((node, start) => { if (node.type.name === 'image') pos = start; });
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    replaceHTMLAtCursor(view, '<img src="/new.png">');
    expect(view.state.doc.nodeAt(pos).attrs.src).to.equal('/new.png');
    expect(view.state.selection).to.be.instanceOf(NodeSelection);
    expect(view.state.selection.from).to.equal(pos);
  });
  it('preserves an explicit block selection', () => {
    const pos = view.state.doc.firstChild.nodeSize;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    replaceHTMLAtCursor(view, '<div class="hero"><div><div><p>New title</p></div></div></div>');
    expect(view.state.selection).to.be.instanceOf(NodeSelection);
    expect(view.state.selection.from).to.equal(pos);
  });
  it('rejects ambiguous or invalid replacements and read-only editors', () => {
    caret('Intro');
    const before = view.state.doc;
    view.dispatch(view.state.tr.setSelection(
      TextSelection.create(before, 2, before.content.size - 1),
    ));
    expect(() => replaceHTMLAtCursor(view, '<p>Bad</p>')).to.throw('multiple replacement targets');
    caret('Intro');
    expect(() => replaceHTMLAtCursor(view, '')).to.throw('Replacement HTML is required');
    expect(() => replaceHTMLAtCursor(view, '<p>One</p><p>Two</p>')).to.throw('exactly one content node');
    view.setProps({ editable: () => false });
    expect(() => replaceHTMLAtCursor(view, '<p>No</p>')).to.throw('read-only');
    expect(view.state.doc).to.equal(before);
  });
  it('keeps the original sendHTML insertion path unchanged', () => {
    caret('Intro', 2);
    insertHTML(view, '<p>Inserted</p>');
    expect(view.state.doc.textContent).to.include('Inserted');
    expect(view.state.doc.textContent).to.include('Original title');
  });
  it('updates the collaborative document and participates in Yjs undo', () => {
    const { schema, doc } = view.state;
    const ydoc = prosemirrorToYDoc(doc);
    try {
      view.updateState(EditorState.create({
        schema,
        plugins: [ySyncPlugin(ydoc.getXmlFragment('prosemirror')), yUndoPlugin()],
      }));
      const pos = caret('Original title', 4);
      replaceHTMLAtCursor(view, '<div class="hero"><div><div><p>Changed title</p></div></div></div>');
      expect(view.state.doc.textContent).to.include('Changed title');
      expect(yDocToProsemirror(schema, ydoc).textContent).to.include('Changed title');
      expect(view.state.selection.from).to.equal(pos);
      expect(yUndo(view.state, (tr) => view.dispatch(tr))).to.equal(true);
      expect(view.state.doc.textContent).to.include('Original title');
    } finally { ydoc.destroy(); }
  });
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

  it('ignores a custom Preflight configured in the prepare sheet', async () => {
    setDaConfigs([{ prepare: { data: [{ title: 'Preflight', path: 'https://example.com/pf' }] } }]);
    const views = await getCanvasToolPanelViews({ org: 'org', site: 'site' });
    const preflight = views.find((v) => v.id === 'preflight');
    expect(preflight).to.include({ label: 'Preflight', firstParty: true });
    expect(preflight.cacheKey).to.equal(undefined);
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

describe('shared block insertion at the live selection', () => {
  const table = (name, body) => ({
    type: 'table',
    content: [
      { type: 'table_row', content: [{ type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: name }] }] }] },
      { type: 'table_row', content: [{ type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }] }] },
    ],
  });
  const nodeText = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
  const replacement = () => {
    const dom = document.createElement('table');
    dom.innerHTML = '<tbody><tr><td><p>New</p></td></tr><tr><td><p>Replacement</p></td></tr></tbody>';
    return dom;
  };
  let view;

  beforeEach(() => {
    view = makeRealView({
      type: 'doc',
      content: [
        nodeText('Intro'), table('Cards', 'Original'), nodeText('Outro'), table('Other', 'Keep'),
      ],
    });
  });
  afterEach(() => {
    const mount = view.dom.parentElement;
    view.destroy();
    mount?.remove();
  });

  const contents = () => {
    const result = [];
    view.state.doc.forEach((node) => result.push([node.type.name, node.textContent]));
    return result;
  };

  it('does not replace the enclosing block for a caret inside a block cell', () => {
    let caret;
    view.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === 'Original') caret = pos + 1;
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, caret)));
    insertBlock(view, replacement());
    expect(view.state.doc.child(1).type.name).to.equal('table');
    expect(view.state.doc.child(1).textContent).to.equal('CardsONewReplacementriginal');
    expect(contents().at(-1)).to.deep.equal(['table', 'OtherKeep']);
  });

  it('retains insertion outside a block', () => {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
    insertBlock(view, replacement());
    expect(contents().filter(([type]) => type === 'table')).to.deep.equal([
      ['table', 'NewReplacement'], ['table', 'CardsOriginal'], ['table', 'OtherKeep'],
    ]);
  });
});
