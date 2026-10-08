import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  EditorState,
  EditorView,
  TextSelection,
  columnResizing,
} from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../../../../scripts/utils.js';
import { createTrackingPlugin } from '../../../../../blocks/canvas/editor-utils/prose-diff.js';
import { getEnterInputRulesPlugin } from '../../../../../blocks/edit/prose/plugins/keyHandlers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getPreviewOrigin;
let fetchWysiwygBranch;
let parseSections;
let updateDocument;
let getEditor;
let mirror;

before(async () => {
  const mod = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js');
  getPreviewOrigin = mod.getPreviewOrigin;
  fetchWysiwygBranch = mod.fetchWysiwygBranch;
  parseSections = mod.parseSections;
  updateDocument = mod.updateDocument;
  getEditor = mod.getEditor;
  mirror = mod.dispatchMirror;
});

describe('getPreviewOrigin', () => {
  it('uses main branch by default', () => {
    const origin = getPreviewOrigin('myorg', 'myrepo');
    expect(origin).to.include('main--myrepo--myorg');
  });

  it('uses the provided branch', () => {
    const origin = getPreviewOrigin('myorg', 'myrepo', 'feature');
    expect(origin).to.include('feature--myrepo--myorg');
  });

  it('uses main when branch is explicitly main', () => {
    const origin = getPreviewOrigin('myorg', 'myrepo', 'main');
    expect(origin).to.include('main--myrepo--myorg');
  });
});

describe('fetchWysiwygBranch', () => {
  let savedFetch;
  let savedSearch;
  let testIndex = 0;

  function setSearch(search) {
    const url = new URL(window.location.href);
    url.search = search;
    window.history.replaceState(null, '', url);
  }

  beforeEach(() => {
    savedFetch = window.fetch;
    savedSearch = window.location.search;
    testIndex += 1;
  });

  afterEach(() => {
    window.fetch = savedFetch;
    setSearch(savedSearch);
  });

  function ctx(extra = {}) {
    return { org: `org-wbr-${testIndex}`, site: `site-wbr-${testIndex}`, ...extra };
  }

  // Mocks the first sheet (json.data) — what getFirstSheet returns for a single-sheet config.
  function mockConfig(rows) {
    const body = JSON.stringify({ data: rows ?? [] });
    window.fetch = () => Promise.resolve(new Response(body, { status: 200 }));
  }

  it('returns main when org is missing', async () => {
    const branch = await fetchWysiwygBranch({ site: 'mysite' });
    expect(branch).to.equal('main');
  });

  it('returns main when site is missing', async () => {
    const branch = await fetchWysiwygBranch({ org: 'myorg' });
    expect(branch).to.equal('main');
  });

  it('returns the configured branch when path matches the prefix', async () => {
    mockConfig([{ key: 'ew.wysiwygBranch', value: '/org-wbr-3/site-wbr-3=feature' }]);
    const branch = await fetchWysiwygBranch(ctx({ path: 'org-wbr-3/site-wbr-3/some/doc' }));
    expect(branch).to.equal('feature');
  });

  it('picks the longest prefix when multiple entries match', async () => {
    mockConfig([
      { key: 'ew.wysiwygBranch', value: '/org-wbr-4/site-wbr-4=main' },
      { key: 'ew.wysiwygBranch', value: '/org-wbr-4/site-wbr-4/docs=develop' },
    ]);
    const branch = await fetchWysiwygBranch(ctx({ path: 'org-wbr-4/site-wbr-4/docs/page' }));
    expect(branch).to.equal('develop');
  });

  it('falls back to the shorter prefix when path is outside the longer one', async () => {
    mockConfig([
      { key: 'ew.wysiwygBranch', value: '/org-wbr-5/site-wbr-5=main' },
      { key: 'ew.wysiwygBranch', value: '/org-wbr-5/site-wbr-5/docs=develop' },
    ]);
    const branch = await fetchWysiwygBranch(ctx({ path: 'org-wbr-5/site-wbr-5/blog/post' }));
    expect(branch).to.equal('main');
  });

  it('trims whitespace from the branch value', async () => {
    mockConfig([{ key: 'ew.wysiwygBranch', value: '/org-wbr-6/site-wbr-6=  staging  ' }]);
    const branch = await fetchWysiwygBranch(ctx({ path: 'org-wbr-6/site-wbr-6/page' }));
    expect(branch).to.equal('staging');
  });

  it('returns main when no prefix matches the path', async () => {
    mockConfig([{ key: 'ew.wysiwygBranch', value: '/other-org/other-site=feature' }]);
    const branch = await fetchWysiwygBranch(ctx({ path: 'org-wbr-7/site-wbr-7/page' }));
    expect(branch).to.equal('main');
  });

  it('returns main when ew.wysiwygBranch key is absent', async () => {
    mockConfig([{ key: 'other.key', value: 'true' }]);
    const branch = await fetchWysiwygBranch(ctx({ path: 'org-wbr-8/site-wbr-8/page' }));
    expect(branch).to.equal('main');
  });

  it('returns main when the sheet is empty', async () => {
    mockConfig([]);
    const branch = await fetchWysiwygBranch(ctx({ path: 'org-wbr-9/site-wbr-9/page' }));
    expect(branch).to.equal('main');
  });

  it('skips entries with no = separator', async () => {
    mockConfig([
      { key: 'ew.wysiwygBranch', value: 'malformed-no-equals' },
      { key: 'ew.wysiwygBranch', value: '/org-wbr-10/site-wbr-10=valid' },
    ]);
    const branch = await fetchWysiwygBranch(ctx({ path: 'org-wbr-10/site-wbr-10/page' }));
    expect(branch).to.equal('valid');
  });

  it('uses the ref query param when present, skipping config lookup', async () => {
    setSearch('?ref=from-query');
    let fetchCalled = false;
    window.fetch = () => {
      fetchCalled = true;
      return Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    };
    const branch = await fetchWysiwygBranch(ctx({ path: 'org-wbr-11/site-wbr-11/page' }));
    expect(branch).to.equal('from-query');
    expect(fetchCalled).to.equal(false);
  });

  it('falls back to config when the ref query param is empty', async () => {
    setSearch('?ref=');
    mockConfig([{ key: 'ew.wysiwygBranch', value: '/org-wbr-12/site-wbr-12=feature' }]);
    const branch = await fetchWysiwygBranch(ctx({ path: 'org-wbr-12/site-wbr-12/page' }));
    expect(branch).to.equal('feature');
  });
});

describe('parseSections', () => {
  it('collects a single block and mirrors it in items (unchanged behavior)', () => {
    const html = `<main><div>
      <div class="hero" data-block-index="0">Hero content</div>
    </div></main>`;
    const [section] = parseSections(html);
    expect(section.blocks).to.deep.equal([
      { name: 'hero', variant: '', blockIndex: 0, proseIndex: 0, innerText: 'Hero content' },
    ]);
    expect(section.items).to.deep.equal([
      {
        type: 'block', name: 'hero', variant: '', blockIndex: 0, proseIndex: 0, innerText: 'Hero content',
      },
    ]);
  });

  it('captures block variant classes (mirrors the doc header parentheses)', () => {
    const html = `<main><div>
      <div class="cards highlight blue" data-block-index="3">Cards</div>
    </div></main>`;
    const [section] = parseSections(html);
    expect(section.blocks[0].name).to.equal('cards');
    expect(section.blocks[0].variant).to.equal('highlight, blue');
  });

  it('returns empty blocks and items for a section with nothing in it', () => {
    const html = '<main><div></div></main>';
    const [section] = parseSections(html);
    expect(section.blocks).to.deep.equal([]);
    expect(section.items).to.deep.equal([]);
  });

  it('produces separate default-content entries before and after a block', () => {
    const html = `<main><div>
      <p data-prose-index="1">Intro text</p>
      <div class="hero" data-block-index="5">Hero</div>
      <p data-prose-index="20">Outro text</p>
    </div></main>`;
    const [section] = parseSections(html);
    expect(section.items.map((i) => i.type)).to.deep.equal(['content', 'block', 'content']);
    expect(section.items[0]).to.deep.equal({
      type: 'content',
      proseIndex: 1,
      innerText: 'Intro text',
      children: [{ type: 'content', kind: 'paragraph', proseIndex: 1, innerText: 'Intro text', snippet: 'Intro text' }],
    });
    expect(section.items[2]).to.deep.equal({
      type: 'content',
      proseIndex: 20,
      innerText: 'Outro text',
      children: [{ type: 'content', kind: 'paragraph', proseIndex: 20, innerText: 'Outro text', snippet: 'Outro text' }],
    });
  });

  it('groups consecutive loose children into a single content entry, listing each child', () => {
    const html = `<main><div>
      <h2 data-prose-index="1">Title</h2>
      <p data-prose-index="5">Para one</p>
      <p data-prose-index="12">Para two</p>
    </div></main>`;
    const [section] = parseSections(html);
    expect(section.items).to.deep.equal([{
      type: 'content',
      proseIndex: 1,
      innerText: 'Title Para one Para two',
      children: [
        {
          type: 'content', kind: 'heading', level: 2, proseIndex: 1, innerText: 'Title', snippet: 'Title',
        },
        { type: 'content', kind: 'paragraph', proseIndex: 5, innerText: 'Para one', snippet: 'Para one' },
        { type: 'content', kind: 'paragraph', proseIndex: 12, innerText: 'Para two', snippet: 'Para two' },
      ],
    }]);
  });

  it('classifies ordered/unordered lists and images', () => {
    const html = `<main><div>
      <ol data-prose-index="1"><li>one</li></ol>
      <ul data-prose-index="5"><li>two</li></ul>
      <picture><img data-image-index="9" src="x.png"></picture>
    </div></main>`;
    const [section] = parseSections(html);
    const [{ children }] = section.items;
    expect(children.map((c) => c.kind)).to.deep.equal(['list', 'list', 'image']);
    expect(children[0].ordered).to.equal(true);
    expect(children[1].ordered).to.equal(false);
  });

  it('classifies a top-level <blockquote> as a quote, not an image', () => {
    const html = `<main><div>
      <blockquote data-prose-index="1">Some wisdom</blockquote>
    </div></main>`;
    const [section] = parseSections(html);
    const [{ children }] = section.items;
    expect(children.map((c) => c.kind)).to.deep.equal(['quote']);
    expect(children[0].proseIndex).to.equal(1);
  });

  it('classifies a <p>-wrapped image as image, not paragraph (prose2aem only unwraps the <p> when the image is the section\'s sole child), and reads the nested image index rather than the <p>\'s own', () => {
    // getInstrumentedHTML stamps data-prose-index on every outermost <p>, including
    // one that only wraps a <picture> — so a realistic fixture must include it too.
    const html = `<main><div>
      <h2 data-prose-index="1">Title</h2>
      <p data-prose-index="4"><picture><img data-image-index="5" src="x.png"></picture></p>
      <p data-prose-index="9">Caption text</p>
    </div></main>`;
    const [section] = parseSections(html);
    const [{ children }] = section.items;
    expect(children.map((c) => c.kind)).to.deep.equal(['heading', 'image', 'paragraph']);
    expect(children[1].proseIndex).to.equal(5);
  });

  it('keeps a paragraph with mixed text and an inline image classified as paragraph', () => {
    const html = `<main><div>
      <p data-prose-index="1">Some text <img data-image-index="3" src="x.png"> more text</p>
    </div></main>`;
    const [section] = parseSections(html);
    const [{ children }] = section.items;
    expect(children[0].kind).to.equal('paragraph');
  });

  it('classifies a <pre> as a code block', () => {
    const html = `<main><div>
      <h2 data-prose-index="1">Title</h2>
      <pre data-prose-index="5"><code>const x = 1;</code></pre>
    </div></main>`;
    const [section] = parseSections(html);
    const [{ children }] = section.items;
    expect(children.map((c) => c.kind)).to.deep.equal(['heading', 'code']);
    expect(children[1]).to.deep.equal({ type: 'content', kind: 'code', proseIndex: 5, innerText: 'const x = 1;', snippet: 'const x = 1;' });
  });

  it('reads proseIndex from data-image-index on a loose image', () => {
    const html = `<main><div>
      <picture><img data-image-index="7" src="x.png"></picture>
    </div></main>`;
    const [section] = parseSections(html);
    expect(section.items).to.deep.equal([{
      type: 'content',
      proseIndex: 7,
      innerText: '',
      children: [{ type: 'content', kind: 'image', proseIndex: 7, innerText: '', snippet: '' }],
    }]);
  });

  it('handles multiple sections independently', () => {
    const html = `<main>
      <div><p data-prose-index="1">Section one text</p></div>
      <div><div class="cards" data-block-index="0">Cards</div></div>
    </main>`;
    const sections = parseSections(html);
    expect(sections).to.have.length(2);
    expect(sections[0].items).to.deep.equal([{
      type: 'content',
      proseIndex: 1,
      innerText: 'Section one text',
      children: [{ type: 'content', kind: 'paragraph', proseIndex: 1, innerText: 'Section one text', snippet: 'Section one text' }],
    }]);
    expect(sections[1].items).to.deep.equal([
      {
        type: 'block', name: 'cards', variant: '', blockIndex: 0, proseIndex: 0, innerText: 'Cards',
      },
    ]);
  });
});

describe('dispatchMirror', () => {
  let dispatchMirror;

  before(async () => {
    ({ dispatchMirror } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js'));
  });

  it('flags the dispatch as iframe-originated only while it runs', () => {
    const ctx = {};
    let seen;
    const view = { dispatch: () => { seen = { ...ctx }; } };
    dispatchMirror(view, {}, ctx);
    expect(seen).to.deep.equal({ suppressRerender: true, mirroringFromIframe: true });
    expect(ctx).to.deep.equal({ suppressRerender: false, mirroringFromIframe: false });
  });

  it('clears both flags even when dispatch throws', () => {
    const ctx = {};
    const view = { dispatch: () => { throw new Error('boom'); } };
    expect(() => dispatchMirror(view, {}, ctx)).to.throw('boom');
    expect(ctx).to.deep.equal({ suppressRerender: false, mirroringFromIframe: false });
  });
});

describe('updateDocument rerender scopes', () => {
  const schema = getSchema();
  const p = (text) => schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
  const h = (text, level = 2) => schema.nodes.heading.create({ level }, schema.text(text));
  const hr = () => schema.nodes.horizontal_rule.create();
  const row = (text) => schema.nodes.table_row.create(null, [
    schema.nodes.table_cell.create(null, p(text)),
  ]);
  const table = (name, ...rows) => schema.nodes.table.create(null, [row(name), ...rows.map(row)]);

  let ctx;
  let container;

  afterEach(() => {
    ctx?.view.destroy();
    container?.remove();
  });

  function mount(nodes) {
    container = document.createElement('div');
    document.body.append(container);
    ctx = { suppressRerender: false, port: { postMessage: sinon.spy() } };
    const tracking = createTrackingPlugin(
      (details) => updateDocument(ctx, details),
      undefined,
      (data) => getEditor(data, ctx),
    );
    ctx.view = new EditorView(container, {
      state: EditorState.create({
        schema,
        doc: schema.nodes.doc.create(null, nodes),
        plugins: [columnResizing(), tracking],
      }),
    });
    updateDocument(ctx);
    return ctx.view;
  }

  const bodies = () => ctx.port.postMessage.getCalls()
    .map(({ args: [message] }) => message)
    .filter(({ type }) => type === 'set-body');
  const lastScope = () => bodies().at(-1).payload.rerenderScope;
  const posOf = (index) => {
    let pos = 0;
    for (let i = 0; i < index; i += 1) pos += ctx.view.state.doc.child(i).nodeSize;
    return pos;
  };
  const dispatch = (build) => ctx.view.dispatch(build(ctx.view.state.tr));
  const replaceChild = (index, node) => dispatch((tr) => tr.replaceWith(
    posOf(index),
    posOf(index) + ctx.view.state.doc.child(index).nodeSize,
    node,
  ));

  it('renders the page when the preview has no baseline yet', () => {
    mount([p('a')]);
    expect(bodies()).to.have.lengthOf(1);
    expect(lastScope()).to.deep.equal({ type: 'page' });
  });

  it('scopes a change to the first node of a section to that section', () => {
    mount([p('Intro'), hr(), h('Title'), p('Tail')]);
    dispatch((tr) => tr.setNodeMarkup(posOf(2), null, { level: 3 }));
    expect(lastScope()).to.deep.equal({ type: 'section', sectionIndex: 1 });
  });

  it('scopes deleting the first node of a section to that section', () => {
    mount([p('Intro'), hr(), p('Delete'), p('Keep')]);
    dispatch((tr) => tr.delete(posOf(2), posOf(3)));
    expect(lastScope()).to.deep.equal({ type: 'section', sectionIndex: 1 });
  });

  it('renders the page for one change spanning two sections', () => {
    mount([p('Intro'), hr(), h('Title')]);
    dispatch((tr) => {
      tr.insertText('longer ', 1);
      return tr.setNodeMarkup(tr.mapping.map(posOf(2)), null, { level: 3 });
    });
    expect(lastScope()).to.deep.equal({ type: 'page' });
  });

  it('scopes a structural block change to the page-wide block', () => {
    mount([table('cards', 'one'), hr(), p('a'), table('columns', 'two')]);
    replaceChild(3, table('columns', 'two', 'three'));
    expect(lastScope()).to.deep.equal({ type: 'block', sectionIndex: 1, blockIndex: 1 });
  });

  it('reports added and removed sections, and the page for merges', () => {
    mount([p('a'), hr(), p('b'), hr(), p('c')]);
    dispatch((tr) => tr.delete(posOf(1), posOf(3)));
    expect(lastScope()).to.deep.equal({ type: 'section-removed', sectionIndex: 1 });

    dispatch((tr) => tr.insert(posOf(1), [hr(), p('b')]));
    expect(lastScope()).to.deep.equal({ type: 'section-added', sectionIndex: 1 });

    dispatch((tr) => tr.delete(posOf(1), posOf(2)));
    expect(lastScope()).to.deep.equal({ type: 'page' });

    dispatch((tr) => tr.insert(posOf(1), hr()));
    expect(lastScope()).to.deep.equal({ type: 'page' });

    dispatch((tr) => tr.delete(0, posOf(2)));
    expect(lastScope()).to.deep.equal({ type: 'section-removed', sectionIndex: 0 });
  });

  it('covers changes the preview missed while rerenders were suppressed', () => {
    mount([p('a'), hr(), p('b'), hr(), p('c')]);
    ctx.suppressRerender = true;
    replaceChild(2, h('b'));
    replaceChild(4, h('c'));
    ctx.suppressRerender = false;
    updateDocument(ctx);
    expect(bodies()).to.have.lengthOf(2);
    expect(lastScope()).to.deep.equal({ type: 'page' });
  });

  it('does not re-render nodes the preview already shows', () => {
    mount([p('a'), hr(), p('b')]);
    dispatch((tr) => tr.insertText('typed ', posOf(2) + 1));
    mirror(ctx.view, ctx.view.state.tr.insertText('mirrored ', 1), ctx);
    expect(bodies()).to.have.lengthOf(1);

    replaceChild(0, h('a'));
    expect(lastScope()).to.deep.equal({ type: 'section', sectionIndex: 0 });
  });

  it('re-renders pushed editor nodes when the iframe asks for a reload', () => {
    mount([p('a'), hr(), p('b')]);
    dispatch((tr) => tr.insertText('typed ', posOf(2) + 1));
    updateDocument(ctx, { fromIframe: true });
    expect(lastScope()).to.deep.equal({ type: 'section', sectionIndex: 1 });
  });

  describe('metadata', () => {
    let clock;

    beforeEach(() => { clock = sinon.useFakeTimers(); });
    afterEach(() => { clock.restore(); });

    it('debounces section metadata and keeps the section scope', () => {
      mount([p('a'), hr(), p('b'), table('section-metadata', 'one')]);
      replaceChild(3, table('section-metadata', 'one', 'two'));
      expect(bodies()).to.have.lengthOf(1);
      clock.tick(2000);
      expect(bodies()).to.have.lengthOf(2);
      expect(lastScope()).to.deep.equal({ type: 'section', sectionIndex: 1 });
    });

    it('keeps every section edited within the debounce window', () => {
      mount([table('section-metadata', 'one'), hr(), table('section-metadata', 'two')]);
      replaceChild(0, table('section-metadata', 'one', 'x'));
      clock.tick(1);
      replaceChild(2, table('section-metadata', 'two', 'y'));
      expect(clock.countTimers()).to.equal(1);
      clock.tick(2000);
      expect(bodies()).to.have.lengthOf(2);
      expect(lastScope()).to.deep.equal({ type: 'page' });
    });

    it('renders the page for page metadata', () => {
      mount([p('a'), table('metadata', 'one')]);
      replaceChild(1, table('metadata', 'one', 'two'));
      clock.tick(2000);
      expect(lastScope()).to.deep.equal({ type: 'page' });
    });

    it('flushes a pending metadata rerender with the next rerender', () => {
      mount([p('a'), table('section-metadata', 'one'), hr(), p('b')]);
      replaceChild(1, table('section-metadata', 'one', 'two'));
      replaceChild(3, h('b'));
      expect(bodies()).to.have.lengthOf(2);
      expect(lastScope()).to.deep.equal({ type: 'page' });
      expect(clock.countTimers()).to.equal(0);
    });
  });
});

describe('updateDocument section count rerenders', () => {
  it('sends one section refresh for the first dash and one body refresh for Enter', () => {
    const schema = getSchema();
    const ctx = { port: { postMessage: sinon.spy() } };
    const syncEditor = sinon.spy();
    const enterPlugin = getEnterInputRulesPlugin();
    const trackingPlugin = createTrackingPlugin(
      (details) => updateDocument(ctx, details),
      undefined,
      syncEditor,
    );
    const container = document.createElement('div');
    document.body.append(container);
    ctx.view = new EditorView(container, {
      state: EditorState.create({
        schema,
        doc: schema.nodes.doc.create(null, schema.nodes.paragraph.create()),
        plugins: [trackingPlugin, enterPlugin],
      }),
    });
    try {
      updateDocument(ctx);
      ctx.view.dispatch(ctx.view.state.tr.insertText('-', 1));
      expect(ctx.port.postMessage.callCount).to.equal(2);
      expect(ctx.port.postMessage.lastCall.args[0].payload.rerenderScope)
        .to.deep.equal({ type: 'section', sectionIndex: 0 });

      ctx.view.dispatch(ctx.view.state.tr.insertText('--', 2));
      expect(syncEditor.callCount).to.equal(1);
      expect(ctx.port.postMessage.callCount).to.equal(2);

      ctx.view.dispatch(ctx.view.state.tr.setSelection(
        TextSelection.create(ctx.view.state.doc, 4),
      ));
      expect(enterPlugin.props.handleKeyDown(ctx.view, { key: 'Enter' })).to.be.true;
      expect(ctx.port.postMessage.callCount).to.equal(3);
      const { body } = ctx.port.postMessage.lastCall.args[0].payload;
      expect(body).to.not.include('---');
      expect(new DOMParser().parseFromString(body, 'text/html').querySelector('main').children)
        .to.have.lengthOf(2);
    } finally {
      ctx.view.destroy();
      container.remove();
    }
  });
});
