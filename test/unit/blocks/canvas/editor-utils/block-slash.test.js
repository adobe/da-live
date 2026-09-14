import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let buildBlockEntries;
let matchBlockEntries;

before(async () => {
  const mod = await import('../../../../../blocks/canvas/editor-utils/block-slash.js');
  buildBlockEntries = mod.buildBlockEntries;
  matchBlockEntries = mod.matchBlockEntries;
});

function sampleEntries() {
  return buildBlockEntries([
    {
      name: 'banner',
      variants: [
        { name: 'banner', variants: undefined, dom: document.createElement('table') },
        { name: 'banner', variants: 'small, blue', tags: 'promo', dom: document.createElement('table') },
      ],
    },
    {
      name: 'cards',
      variants: [
        { name: 'cards', variants: undefined, dom: document.createElement('table') },
      ],
    },
  ]);
}

describe('buildBlockEntries', () => {
  it('flattens blocks and variants into namespaced entries', () => {
    const entries = sampleEntries();
    expect(entries).to.have.lengthOf(3);
    expect(entries[0].id).to.equal('block:0');
    expect(entries[1].id).to.equal('block:1');
    expect(entries[2].id).to.equal('block:2');
    expect(entries[1].blockName).to.equal('banner');
    expect(entries[1].variants).to.equal('small, blue');
    expect(entries[2].blockName).to.equal('cards');
  });

  it('tolerates blocks with no variants', () => {
    const entries = buildBlockEntries([{ name: 'empty' }]);
    expect(entries).to.deep.equal([]);
  });
});

describe('matchBlockEntries', () => {
  it('returns [] for an empty query', () => {
    expect(matchBlockEntries(sampleEntries(), '')).to.deep.equal([]);
    expect(matchBlockEntries(sampleEntries(), '   ')).to.deep.equal([]);
  });

  it('matches by block name prefix', () => {
    const items = matchBlockEntries(sampleEntries(), 'ban');
    expect(items).to.have.lengthOf(2);
    expect(items.every((i) => i.id.startsWith('block:'))).to.be.true;
    expect(items[0].icon).to.equal('tableadd');
  });

  it('carries the variants string as the description', () => {
    const items = matchBlockEntries(sampleEntries(), 'blue');
    expect(items).to.have.lengthOf(1);
    expect(items[0].label).to.equal('banner');
    expect(items[0].description).to.equal('small, blue');
  });

  it('matches all whitespace-separated terms (contains-all)', () => {
    const items = matchBlockEntries(sampleEntries(), 'banner promo');
    expect(items).to.have.lengthOf(1);
    expect(items[0].description).to.equal('small, blue');
  });

  it('matches against tags', () => {
    const items = matchBlockEntries(sampleEntries(), 'promo');
    expect(items).to.have.lengthOf(1);
  });

  it('ranks name-prefix matches above contains-only matches', () => {
    const entries = buildBlockEntries([
      { name: 'hero', variants: [{ name: 'hero', variants: 'card', dom: document.createElement('table') }] },
      { name: 'card', variants: [{ name: 'card', variants: undefined, dom: document.createElement('table') }] },
    ]);
    const items = matchBlockEntries(entries, 'card');
    // "card" (name prefix) ranks before "hero" (matched only via its "card" variant)
    expect(items[0].label).to.equal('card');
    expect(items[1].label).to.equal('hero');
  });

  it('splits a heading-named variant "Name (variant)" into label + description', () => {
    const entries = buildBlockEntries([
      { name: 'banner', variants: [{ name: 'Banner (blue)', dom: document.createElement('table') }] },
    ]);
    const items = matchBlockEntries(entries, 'banner');
    expect(items).to.have.lengthOf(1);
    expect(items[0].label).to.equal('Banner');
    expect(items[0].description).to.equal('blue');
  });

  it('still matches on the parenthetical variant text after the split', () => {
    const entries = buildBlockEntries([
      { name: 'cards', variants: [{ name: 'Cards (no images)', dom: document.createElement('table') }] },
    ]);
    const items = matchBlockEntries(entries, 'no images');
    expect(items).to.have.lengthOf(1);
    expect(items[0].label).to.equal('Cards');
    expect(items[0].description).to.equal('no images');
  });

  it('leaves a plain variant name without a description', () => {
    const entries = buildBlockEntries([
      { name: 'hero', variants: [{ name: 'Hero', dom: document.createElement('table') }] },
    ]);
    const items = matchBlockEntries(entries, 'hero');
    expect(items[0].label).to.equal('Hero');
    expect(items[0].description).to.be.undefined;
  });

  it('prefers an explicit variants string over parsing the name', () => {
    const entries = buildBlockEntries([
      { name: 'banner', variants: [{ name: 'banner', variants: 'small, blue', dom: document.createElement('table') }] },
    ]);
    const items = matchBlockEntries(entries, 'banner');
    expect(items[0].label).to.equal('banner');
    expect(items[0].description).to.equal('small, blue');
  });
});

describe('block-slash store', () => {
  let ingestBlocks;
  let blockItemsForQuery;
  let insertBlockItem;
  let hasLibrary;
  let getState;
  let resetBlockLibrary;

  let ensureBlockLibrary;
  let checkBlockLibraryConfigured;
  let resetBlockLibraryCache;

  before(async () => {
    const mod = await import('../../../../../blocks/canvas/editor-utils/block-slash.js');
    ingestBlocks = mod.ingestBlocks;
    blockItemsForQuery = mod.blockItemsForQuery;
    insertBlockItem = mod.insertBlockItem;
    hasLibrary = mod.hasLibrary;
    getState = mod.getState;
    resetBlockLibrary = mod.resetBlockLibrary;
    ensureBlockLibrary = mod.ensureBlockLibrary;
    checkBlockLibraryConfigured = mod.checkBlockLibraryConfigured;
    ({ resetBlockLibraryCache } = await import('../../../../../blocks/canvas/ew-panel-extensions/helpers.js'));
  });

  afterEach(() => {
    resetBlockLibrary();
    resetBlockLibraryCache();
  });

  function mockBlocks() {
    return [
      {
        name: 'banner',
        path: '/banner',
        loadVariants: Promise.resolve([
          { name: 'banner', variants: 'small, blue', dom: document.createElement('table') },
        ]),
      },
    ];
  }

  it('starts idle with no library', () => {
    expect(getState()).to.equal('idle');
    expect(hasLibrary()).to.be.false;
    expect(blockItemsForQuery('banner')).to.deep.equal([]);
  });

  it('ingests blocks into a queryable ready store', async () => {
    await ingestBlocks(mockBlocks());
    expect(getState()).to.equal('ready');
    expect(hasLibrary()).to.be.true;
    const items = blockItemsForQuery('ban');
    expect(items).to.have.lengthOf(1);
    expect(items[0].description).to.equal('small, blue');
  });

  it('sets state empty when there are no variants', async () => {
    await ingestBlocks([{ name: 'x', path: '/x', loadVariants: Promise.resolve([]) }]);
    expect(getState()).to.equal('empty');
  });

  it('insertBlockItem inserts the entry block into the editor at the cursor', async () => {
    const { EditorState } = await import('da-y-wrapper');
    const { getSchema } = await import('da-parser');
    const schema = getSchema();

    const table = document.createElement('table');
    table.innerHTML = '<tr><td>hero</td></tr><tr><td>content</td></tr>';
    await ingestBlocks([
      {
        name: 'hero',
        path: '/hero',
        loadVariants: Promise.resolve([
          { name: 'hero', variants: undefined, dom: table },
        ]),
      },
    ]);

    const doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create());
    let state = EditorState.create({ schema, doc });
    const view = {
      get state() { return state; },
      dispatch(tr) { state = state.apply(tr); },
      focus() {},
    };

    const before = state.doc.content.size;
    await insertBlockItem(view, 'block:0');
    // Real insertion through helpers.insertBlock grows the document.
    expect(state.doc.content.size).to.be.greaterThan(before);
  });

  it('insertBlockItem is a no-op for an unknown id (never dispatches)', async () => {
    await ingestBlocks(mockBlocks());
    const view = { state: {}, dispatch() { throw new Error('should not dispatch'); } };
    let threw = false;
    try {
      await insertBlockItem(view, 'block:nope');
    } catch {
      threw = true;
    }
    expect(threw).to.be.false;
  });

  it('resetBlockLibrary clears the store', async () => {
    await ingestBlocks(mockBlocks());
    resetBlockLibrary();
    expect(getState()).to.equal('idle');
    expect(hasLibrary()).to.be.false;
    expect(blockItemsForQuery('ban')).to.deep.equal([]);
  });

  it('ensureBlockLibrary goes loading then settles empty when no blocks extension is configured', async () => {
    // The test fixture's fetchDaConfigs returns {}, so fetchExtensions yields no 'blocks'
    // extension — this exercises the no-library branch.
    const pending = ensureBlockLibrary({ org: 'testorg', site: 'testsite' });
    expect(getState()).to.equal('loading');
    await pending;
    expect(hasLibrary()).to.be.false;
    expect(getState()).to.equal('empty');
  });

  it('ensureBlockLibrary returns null and settles empty synchronously when org/site are missing', () => {
    expect(ensureBlockLibrary({})).to.be.null;
    expect(getState()).to.equal('empty');
    expect(hasLibrary()).to.be.false;
  });

  it('ensureBlockLibrary returns null once a load is already in flight or done', async () => {
    const pending = ensureBlockLibrary({ org: 'testorg', site: 'testsite' });
    expect(ensureBlockLibrary({ org: 'testorg', site: 'testsite' })).to.be.null;
    await pending;
    expect(ensureBlockLibrary({ org: 'testorg', site: 'testsite' })).to.be.null;
  });

  it('checkBlockLibraryConfigured records hasLibrary false when no blocks extension is configured', async () => {
    // The fixture config exposes no 'blocks' extension. The check is config-only —
    // it must not fetch blocks (state stays idle) or flip hasLibrary true.
    await checkBlockLibraryConfigured({ org: 'testorg', site: 'testsite' });
    expect(hasLibrary()).to.be.false;
    expect(getState()).to.equal('idle');
  });

  it('checkBlockLibraryConfigured returns null and clears hasLibrary when org/site are missing', () => {
    expect(checkBlockLibraryConfigured({})).to.be.null;
    expect(hasLibrary()).to.be.false;
  });
});
