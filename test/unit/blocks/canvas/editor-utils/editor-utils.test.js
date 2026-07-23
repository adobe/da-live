import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getPreviewOrigin;
let fetchWysiwygBranch;
let parseSections;

before(async () => {
  const mod = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js');
  getPreviewOrigin = mod.getPreviewOrigin;
  fetchWysiwygBranch = mod.fetchWysiwygBranch;
  parseSections = mod.parseSections;
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
  let testIndex = 0;

  beforeEach(() => {
    savedFetch = window.fetch;
    testIndex += 1;
  });

  afterEach(() => {
    window.fetch = savedFetch;
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
});

describe('parseSections', () => {
  it('collects a single block and mirrors it in items (unchanged behavior)', () => {
    const html = `<main><div>
      <div class="hero" data-block-index="0">Hero content</div>
    </div></main>`;
    const [section] = parseSections(html);
    expect(section.blocks).to.deep.equal([
      { name: 'hero', blockIndex: 0, proseIndex: 0, innerText: 'Hero content' },
    ]);
    expect(section.items).to.deep.equal([
      { type: 'block', name: 'hero', blockIndex: 0, proseIndex: 0, innerText: 'Hero content' },
    ]);
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
      children: [{ type: 'content', kind: 'paragraph', proseIndex: 1, innerText: 'Intro text' }],
    });
    expect(section.items[2]).to.deep.equal({
      type: 'content',
      proseIndex: 20,
      innerText: 'Outro text',
      children: [{ type: 'content', kind: 'paragraph', proseIndex: 20, innerText: 'Outro text' }],
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
        { type: 'content', kind: 'heading', level: 2, proseIndex: 1, innerText: 'Title' },
        { type: 'content', kind: 'paragraph', proseIndex: 5, innerText: 'Para one' },
        { type: 'content', kind: 'paragraph', proseIndex: 12, innerText: 'Para two' },
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

  it('classifies a <p>-wrapped image as image, not paragraph (prose2aem only unwraps the <p> when the image is the section\'s sole child)', () => {
    const html = `<main><div>
      <h2 data-prose-index="1">Title</h2>
      <p><picture><img data-image-index="5" src="x.png"></picture></p>
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
    expect(children[1]).to.deep.equal({ type: 'content', kind: 'code', proseIndex: 5, innerText: 'const x = 1;' });
  });

  it('treats empty loose nodes as invisible — they neither break nor join a run', () => {
    const html = `<main><div>
      <p data-prose-index="1">Para one</p>
      <h2></h2>
      <p data-prose-index="12">   </p>
      <p data-prose-index="20">Para two</p>
    </div></main>`;
    const [section] = parseSections(html);
    expect(section.items).to.deep.equal([{
      type: 'content',
      proseIndex: 1,
      innerText: 'Para one Para two',
      children: [
        { type: 'content', kind: 'paragraph', proseIndex: 1, innerText: 'Para one' },
        { type: 'content', kind: 'paragraph', proseIndex: 20, innerText: 'Para two' },
      ],
    }]);
  });

  it('produces nothing for a run made up entirely of empty nodes', () => {
    const html = `<main><div>
      <div class="hero" data-block-index="0">Hero</div>
      <h2></h2>
      <p>   </p>
    </div></main>`;
    const [section] = parseSections(html);
    expect(section.items).to.have.length(1);
    expect(section.items[0].type).to.equal('block');
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
      children: [{ type: 'content', kind: 'image', proseIndex: 7, innerText: '' }],
    }]);
  });

  it('takes proseIndex from the first non-empty node in a run', () => {
    const html = `<main><div>
      <h2></h2>
      <p data-prose-index="9">First real content</p>
      <p data-prose-index="15">More content</p>
    </div></main>`;
    const [section] = parseSections(html);
    expect(section.items).to.deep.equal([{
      type: 'content',
      proseIndex: 9,
      innerText: 'First real content More content',
      children: [
        { type: 'content', kind: 'paragraph', proseIndex: 9, innerText: 'First real content' },
        { type: 'content', kind: 'paragraph', proseIndex: 15, innerText: 'More content' },
      ],
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
      children: [{ type: 'content', kind: 'paragraph', proseIndex: 1, innerText: 'Section one text' }],
    }]);
    expect(sections[1].items).to.deep.equal([
      { type: 'block', name: 'cards', blockIndex: 0, proseIndex: 0, innerText: 'Cards' },
    ]);
  });
});
