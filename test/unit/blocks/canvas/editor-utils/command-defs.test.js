import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let slashMenuItemsForQuery;
let applySlashSelection;
let COMMAND_BY_ID;
let ingestBlocks;
let resetBlockLibrary;

before(async () => {
  const cmd = await import('../../../../../blocks/canvas/editor-utils/command-defs.js');
  slashMenuItemsForQuery = cmd.slashMenuItemsForQuery;
  applySlashSelection = cmd.applySlashSelection;
  COMMAND_BY_ID = cmd.COMMAND_BY_ID;
  const bs = await import('../../../../../blocks/canvas/editor-utils/block-slash.js');
  ingestBlocks = bs.ingestBlocks;
  resetBlockLibrary = bs.resetBlockLibrary;
});

afterEach(() => resetBlockLibrary());

async function seed() {
  await ingestBlocks([
    {
      name: 'banner',
      path: '/banner',
      loadVariants: Promise.resolve([
        { name: 'banner', variants: 'small, blue', dom: document.createElement('table') },
      ]),
    },
  ]);
}

const sections = (items) => items.filter((i) => i.section).map((i) => i.section);

describe('slashMenuItemsForQuery', () => {
  it('shows only commands for an empty query (no inline block rows)', () => {
    const items = slashMenuItemsForQuery('');
    expect(items.some((i) => i.id && i.id.startsWith('block:'))).to.be.false;
    expect(items.some((i) => i.id === 'insert-block')).to.be.true;
  });

  it('hides "Open block library" when no library is configured', () => {
    const items = slashMenuItemsForQuery('');
    expect(items.some((i) => i.id === 'open-library')).to.be.false;
  });

  it('shows "Open block library" for the empty menu once a library is ingested', async () => {
    await seed();
    const items = slashMenuItemsForQuery('');
    expect(items.some((i) => i.id === 'open-library')).to.be.true;
    expect(items.some((i) => i.id === 'insert-block')).to.be.true;
  });

  it('hangs a type-to-search hint off "Open block library" on the empty menu', async () => {
    await seed();
    const openLib = slashMenuItemsForQuery('').find((i) => i.id === 'open-library');
    expect(openLib).to.exist;
    expect((openLib.description || '').toLowerCase()).to.contain('type a block name');
  });

  it('shows no hint when no library is configured (no Open block library entry)', () => {
    const items = slashMenuItemsForQuery('');
    expect(items.some((i) => i.id === 'open-library')).to.be.false;
  });

  it('drops the Open block library hint once the user starts typing', async () => {
    await seed();
    const items = slashMenuItemsForQuery('ban');
    expect(items.some((i) => i.id === 'open-library')).to.be.false;
  });

  it('shows inline block rows for a matching query and prefix-filters block commands out', async () => {
    await seed();
    const items = slashMenuItemsForQuery('ban');
    expect(sections(items)).to.include('Blocks');
    expect(items.some((i) => i.id && i.id.startsWith('block:'))).to.be.true;
    expect(items.some((i) => i.id === 'open-library')).to.be.false;
    expect(items.some((i) => i.id === 'insert-block')).to.be.false;
  });

  it('matches text commands too', () => {
    const items = slashMenuItemsForQuery('head');
    expect(sections(items)).to.include('Text');
    expect(items.some((i) => i.id === 'heading-1')).to.be.true;
  });

  it('returns nothing for a non-matching non-empty query so the menu can auto-close', () => {
    expect(slashMenuItemsForQuery('zzzznomatch')).to.deep.equal([]);
  });
});

describe('applySlashSelection', () => {
  it('runs the matching static command with the view', () => {
    const target = COMMAND_BY_ID.get('heading-2');
    const stub = sinon.stub(target, 'apply');
    const fakeView = { id: 'view' };
    applySlashSelection(fakeView, 'heading-2');
    expect(stub.calledOnce).to.be.true;
    expect(stub.firstCall.args[0]).to.equal(fakeView);
    stub.restore();
  });

  it('routes block: ids to real block insertion', async () => {
    const { EditorState } = await import('da-y-wrapper');
    const { getSchema } = await import('da-parser');
    const schema = getSchema();

    const table = document.createElement('table');
    table.innerHTML = '<tr><td>banner</td></tr><tr><td>content</td></tr>';
    await ingestBlocks([
      {
        name: 'banner',
        path: '/banner',
        loadVariants: Promise.resolve([
          { name: 'banner', variants: 'small, blue', dom: table },
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
    await applySlashSelection(view, 'block:0');
    expect(state.doc.content.size).to.be.greaterThan(before);
  });

  it('returns undefined for an unknown id', () => {
    expect(applySlashSelection({}, 'totally-unknown-id')).to.be.undefined;
  });
});
