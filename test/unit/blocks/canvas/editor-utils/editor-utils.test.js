import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getPreviewOrigin;
let fetchWysiwygBranch;
let parseSections;
let resolveChangedScope;
let updateDocument;

before(async () => {
  const mod = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js');
  getPreviewOrigin = mod.getPreviewOrigin;
  fetchWysiwygBranch = mod.fetchWysiwygBranch;
  parseSections = mod.parseSections;
  resolveChangedScope = mod.resolveChangedScope;
  updateDocument = mod.updateDocument;
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
      {
        name: 'hero', variant: '', blockIndex: 0, proseIndex: 0, blockEnd: undefined, innerText: 'Hero content',
      },
    ]);
    expect(section.items).to.deep.equal([
      {
        type: 'block', name: 'hero', variant: '', blockIndex: 0, proseIndex: 0, blockEnd: undefined, innerText: 'Hero content',
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
        type: 'block', name: 'cards', variant: '', blockIndex: 0, proseIndex: 0, blockEnd: undefined, innerText: 'Cards',
      },
    ]);
  });
});

describe('resolveChangedScope', () => {
  const html = `<main>
    <div>
      <p data-prose-index="1">Intro</p>
      <div class="cards" data-block-index="10">Cards</div>
      <p data-prose-index="20">Outro</p>
    </div>
    <div><div class="hero" data-block-index="30">Hero</div></div>
  </main>`;

  it('resolves a block-local change to its block and section', () => {
    const owners = resolveChangedScope({
      changes: [{ type: 'text', pos: 12 }],
      sections: parseSections(html),
    });

    expect(owners).to.deep.equal({
      sectionIndexes: [0],
      blocks: [{ sectionIndex: 0, blockIndex: 0 }],
      metadataNames: [],
    });
  });

  it('resolves default content to its section without assigning a block', () => {
    const owners = resolveChangedScope({
      changes: [{ type: 'text', pos: 5 }],
      sections: parseSections(html),
    });

    expect(owners).to.deep.equal({ sectionIndexes: [0], blocks: [], metadataNames: [] });
  });

  it('returns owners from multiple sections for a cross-section change', () => {
    const owners = resolveChangedScope({
      changes: [{ type: 'text', pos: 12 }, { type: 'text', pos: 30 }],
      sections: parseSections(html),
    });

    expect(owners).to.deep.equal({
      sectionIndexes: [0, 1],
      blocks: [
        { sectionIndex: 0, blockIndex: 0 },
        { sectionIndex: 1, blockIndex: 1 },
      ],
      metadataNames: [],
    });
  });

  it('resolves deleted content against the previous section metadata', () => {
    const owners = resolveChangedScope({
      changes: [{ type: 'deleted', pos: 12 }],
      sections: parseSections('<main><div><p data-prose-index="1">Intro</p></div></main>'),
      previousSections: parseSections(html),
    });

    expect(owners).to.deep.equal({
      sectionIndexes: [0],
      blocks: [{ sectionIndex: 0, blockIndex: 0 }],
      metadataNames: [],
    });
  });

  it('returns null when a change position has no unambiguous owner', () => {
    const owners = resolveChangedScope({
      changes: [{ type: 'text', pos: 0 }],
      sections: parseSections(html),
    });

    expect(owners).to.be.null;
  });

  it('retains page and section metadata names without treating them as blocks', () => {
    const sections = parseSections(`<main>
      <div><div class="metadata" data-block-index="1">Page metadata</div></div>
      <div><div class="section-metadata" data-block-index="10">Section metadata</div></div>
    </main>`);

    expect(resolveChangedScope({ changes: [{ type: 'attrs', pos: 1 }], sections })).to.deep.equal({
      sectionIndexes: [0],
      blocks: [],
      metadataNames: ['metadata'],
    });
    expect(resolveChangedScope({ changes: [{ type: 'attrs', pos: 10 }], sections })).to.deep.equal({
      sectionIndexes: [1],
      blocks: [],
      metadataNames: ['section-metadata'],
    });
  });
});

describe('updateDocument metadata rerenders', () => {
  let clock;

  beforeEach(() => { clock = sinon.useFakeTimers(); });
  afterEach(() => { clock.restore(); });

  function ctxForBody(body) {
    const dom = document.createElement('div');
    dom.innerHTML = body;
    return {
      suppressRerender: false,
      view: { dom },
      port: { postMessage: sinon.spy() },
    };
  }

  function tableNode(name) {
    const cell = { type: { name: 'table_cell' }, textContent: name, childCount: 1 };
    const row = { type: { name: 'table_row' }, childCount: 2, child: () => cell };
    const table = { type: { name: 'table' }, child: () => row };
    return { table, row, cell };
  }

  function ctxForTable(name, selectionPos = 10) {
    const dom = document.createElement('div');
    dom.innerHTML = `
      <div class="tableWrapper">
        <table>
          <tbody>
            <tr><td><p>${name}</p></td></tr>
            <tr><td><p>key</p></td><td><p>value</p></td></tr>
          </tbody>
        </table>
      </div>
    `;
    const { table, row, cell } = tableNode(name);
    return {
      suppressRerender: false,
      view: {
        dom,
        posAtDOM: () => 1,
        state: {
          selection: { from: selectionPos },
          doc: {
            resolve: () => ({
              depth: 4,
              parent: { nodeSize: 50 },
              node: (depth) => [null, table, row, cell, { type: { name: 'paragraph' } }][depth],
              index: () => 1,
            }),
          },
        },
      },
      port: { postMessage: sinon.spy() },
    };
  }

  it('debounces page metadata rerenders for 3 seconds', () => {
    const ctx = ctxForBody('<div class="metadata" data-block-index="1">Page metadata</div>');

    updateDocument(ctx, { changes: [{ type: 'attrs', pos: 1 }] });

    expect(ctx.port.postMessage.called).to.be.false;
    clock.tick(2999);
    expect(ctx.port.postMessage.called).to.be.false;
    clock.tick(1);
    expect(ctx.port.postMessage.calledOnce).to.be.true;
    expect(ctx.port.postMessage.firstCall.args[0].payload.rerenderScope).to.deep.equal({ type: 'page' });
  });

  it('debounces section metadata rerenders and keeps section scope', () => {
    const ctx = ctxForBody(`
      <div class="metadata" data-block-index="1">Page metadata</div>
      <hr>
      <div class="section-metadata" data-block-index="10">Section metadata</div>
    `);

    updateDocument(ctx, { changes: [{ type: 'attrs', pos: 10 }] });

    expect(ctx.port.postMessage.called).to.be.false;
    clock.tick(3000);
    expect(ctx.port.postMessage.calledOnce).to.be.true;
    expect(ctx.port.postMessage.firstCall.args[0].payload.rerenderScope).to.deep.equal({
      type: 'section',
      sectionIndex: 1,
    });
  });

  it('restarts the debounce window for repeated metadata edits', () => {
    const ctx = ctxForBody('<div class="metadata" data-block-index="1">Page metadata</div>');

    updateDocument(ctx, { changes: [{ type: 'attrs', pos: 1 }] });
    clock.tick(2000);
    updateDocument(ctx, { changes: [{ type: 'attrs', pos: 1 }] });
    clock.tick(2999);
    expect(ctx.port.postMessage.called).to.be.false;
    clock.tick(1);
    expect(ctx.port.postMessage.calledOnce).to.be.true;
  });

  it('flushes a pending metadata rerender before a following non-metadata rerender', () => {
    const ctx = ctxForBody(`
      <div class="metadata" data-block-index="1">Page metadata</div>
      <div class="hero" data-block-index="20">Hero</div>
    `);

    updateDocument(ctx, { changes: [{ type: 'attrs', pos: 1 }] });
    clock.tick(1000);
    updateDocument(ctx, { changes: [{ type: 'attrs', pos: 20 }] });

    expect(ctx.port.postMessage.callCount).to.equal(2);
    expect(ctx.port.postMessage.firstCall.args[0].payload.rerenderScope).to.deep.equal({ type: 'page' });
    expect(ctx.port.postMessage.secondCall.args[0].payload.rerenderScope).to.deep.equal({
      type: 'block',
      sectionIndex: 0,
      blockIndex: 0,
    });
  });

  it('debounces metadata rerenders when missing details but selection is inside metadata', () => {
    const ctx = ctxForTable('Metadata');

    updateDocument(ctx);

    expect(ctx.port.postMessage.called).to.be.false;
    clock.tick(3000);
    expect(ctx.port.postMessage.calledOnce).to.be.true;
    expect(ctx.port.postMessage.firstCall.args[0].payload.rerenderScope).to.deep.equal({ type: 'page' });
  });

  it('debounces section metadata rerenders when missing details but selection is inside section metadata', () => {
    const ctx = ctxForTable('Section-Metadata');

    updateDocument(ctx);

    expect(ctx.port.postMessage.called).to.be.false;
    clock.tick(3000);
    expect(ctx.port.postMessage.calledOnce).to.be.true;
    expect(ctx.port.postMessage.firstCall.args[0].payload.rerenderScope).to.deep.equal({
      type: 'section',
      sectionIndex: 0,
    });
  });
});
