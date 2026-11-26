import { expect } from '@esm-bundle/chai';
import { NodeSelection, TextSelection } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';
import { makeRealView } from '../test-helpers.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
import {
  resolveBlockPosition,
  blockPositionToPos,
  setBlockSelection,
} from '../../../../../blocks/canvas/editor-utils/blocks.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createBlockOperatorHost, blockNodeToHtml } = await import('../../../../../blocks/canvas/editor-utils/block-operators.js');
const { operatorRegistryFromRows, loadOperatorModule, resolveOperatorUrl } = await import('../../../../../blocks/canvas/ew-panel-extensions/helpers.js');

const p = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });
const cell = (text) => ({ type: 'table_cell', content: [p(text)] });
const row = (...texts) => ({ type: 'table_row', content: texts.map(cell) });
const table = (name, ...rows) => ({
  type: 'table',
  content: [{ type: 'table_row', content: [{ type: 'table_cell', attrs: { colspan: 2 }, content: [p(name)] }] }, ...rows],
});
const accordion = () => table('accordion', row('Q1', 'A1'), row('Q2', 'A2'));

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

function makeDoc() {
  return makeRealView({ type: 'doc', content: [p('Intro'), table('hero', row('Hi')), accordion()] });
}

function destroyView(view) {
  const mount = view.dom.parentElement;
  view.destroy();
  mount?.remove();
}

function textPos(view, text) {
  let found;
  view.state.doc.descendants((node, pos) => {
    if (found === undefined && node.isText && node.text === text) found = pos;
  });
  return found;
}

describe('block operator positions', () => {
  let view;
  beforeEach(() => { view = makeDoc(); });
  afterEach(() => destroyView(view));

  it('maps a caret in a cell to { row, cell, textOffset } and back', () => {
    const pos = textPos(view, 'A2') + 1;
    const hit = resolveBlockPosition(view, pos);
    expect(hit).to.deep.equal({ blockIndex: 1, position: { row: 1, cell: 1, textOffset: 1 } });
    expect(blockPositionToPos(view, 1, hit.position)).to.equal(pos);
  });

  it('has no position in the header row or outside blocks', () => {
    expect(resolveBlockPosition(view, textPos(view, 'accordion') + 1).position).to.equal(null);
    expect(resolveBlockPosition(view, 2)).to.equal(null);
  });

  it('clamps a text offset past the end and rejects missing cells', () => {
    expect(blockPositionToPos(view, 1, { row: 0, cell: 0, textOffset: 99 }))
      .to.equal(textPos(view, 'Q1') + 2);
    expect(blockPositionToPos(view, 1, { row: 5, cell: 0 })).to.equal(null);
    expect(blockPositionToPos(view, 7, { row: 0, cell: 0 })).to.equal(null);
  });

  it('setBlockSelection puts the caret at the position', () => {
    expect(setBlockSelection(view, 1, { row: 0, cell: 1, textOffset: 0 })).to.equal(true);
    expect(view.state.selection.from).to.equal(textPos(view, 'A1'));
    expect(setBlockSelection(view, 1, { row: 9, cell: 0 })).to.equal(false);
  });
});

describe('operator registry', () => {
  it('maps normalized block names to resolved URLs, first row wins', () => {
    const rows = [
      { block: 'Accordion', property: 'operator', value: '/ops/accordion.js' },
      { block: 'accordion', property: 'operator', value: '/ops/other.js' },
      { block: 'cards', property: 'multi', value: '' },
      { block: 'My_Form', property: ' Operator ', value: 'https://x.test/form.js' },
      { block: 'empty', property: 'operator', value: '' },
    ];
    const registry = operatorRegistryFromRows(rows, (v) => (v.startsWith('/') ? `https://site${v}` : v));
    expect([...registry]).to.deep.equal([
      ['accordion', 'https://site/ops/accordion.js'],
      ['my form', 'https://x.test/form.js'],
    ]);
  });

  it('resolves site-relative operator paths against the DA preview origin', () => {
    expect(resolveOperatorUrl('org', 'site', ' /ops/form.js'))
      .to.equal('https://main--site--org.preview.da.live/ops/form.js');
    expect(resolveOperatorUrl('org', 'site', 'https://x.test/a.js')).to.equal('https://x.test/a.js');
  });

  it('imports a module once per URL and requires create()', async () => {
    const url = 'data:text/javascript,export default { create() { return {}; } };';
    const first = loadOperatorModule(url);
    expect(loadOperatorModule(url)).to.equal(first);
    expect(typeof (await first).create).to.equal('function');
    let error;
    try {
      await loadOperatorModule('data:text/javascript,export default {};');
    } catch (e) {
      error = e;
    }
    expect(error?.message).to.include('create()');
  });
});

describe('block operator host', () => {
  let view;
  let host;
  let created;
  let operator;

  const attach = async (registry = new Map([['accordion', 'https://ops.test/accordion.js']])) => {
    host = createBlockOperatorHost({
      getView: () => view,
      loadOperators: async () => registry,
      loadModule: async () => operator,
    });
    await host.attach({ org: 'org', site: 'site' });
    await flush();
  };

  beforeEach(() => {
    view = makeDoc();
    created = [];
    operator = {
      create(ctx) {
        const instance = {
          ctx,
          updates: [],
          update(next) { this.updates.push(next.html); },
          destroyed: false,
          destroy() { this.destroyed = true; },
          resolve: ({ row: r }) => `/items/${r}`,
          locate: (itemId) => ({ row: Number(itemId.split('/')[2]), cell: 0, textOffset: 1 }),
          outline: { mount: () => ({ unmount() {} }) },
        };
        created.push(instance);
        return instance;
      },
    };
  });

  afterEach(() => {
    host?.detach();
    destroyView(view);
  });

  it('does nothing for sites without operator rows', async () => {
    await attach(new Map());
    expect(created).to.have.length(0);
    expect(host.getInstance(1)).to.equal(null);
  });

  it('creates one instance per operator block with the spec ctx', async () => {
    await attach();
    expect(created).to.have.length(1);
    const { ctx } = created[0];
    expect(ctx).to.include({ name: 'accordion', variant: '', blockIndex: 1, editable: true });
    expect(ctx.html).to.match(/^<div class="accordion"><div><div>/);
    expect(ctx.html).to.include('Q1').and.include('A2');
    expect(ctx).to.not.have.property('styles');
    expect(host.getInstance(1)).to.equal(created[0]);
    expect(host.getInstance(0)).to.equal(null);
  });

  it('skips blocks whose operator does not match the variant', async () => {
    operator.matches = ({ variant }) => variant === 'faq';
    await attach();
    expect(created).to.have.length(0);
    expect(host.getInstance(1)).to.equal(null);
  });

  it('commits by block index and updates the instance', async () => {
    await attach();
    const [instance] = created;
    const result = await instance.ctx.commit('<div class="accordion"><div><div>Q9</div><div>A9</div></div></div>');
    expect(result).to.deep.equal({ ok: true });
    const blockText = view.state.doc.child(2).textContent;
    expect(blockText).to.include('Q9').and.not.include('Q1');
    expect(view.state.doc.child(0).textContent).to.equal('Intro');
    expect(instance.updates.at(-1)).to.include('Q9');
    expect(instance.ctx.html).to.include('Q9');
  });

  it('rejects stale, invalid, read-only and editor-less commits', async () => {
    await attach();
    const [instance] = created;
    const valid = '<div class="accordion"><div><div>X</div></div></div>';

    expect((await instance.ctx.commit('<div class="hero"><div><div>X</div></div></div>')).error).to.equal('INVALID_HTML');
    expect((await instance.ctx.commit(`${valid}${valid}`)).error).to.equal('INVALID_HTML');

    const pos = textPos(view, 'A1');
    view.dispatch(view.state.tr.insertText('!', pos));
    expect((await instance.ctx.commit(valid)).error).to.equal('STALE');

    host.sync();
    view.setProps({ editable: () => false });
    expect((await instance.ctx.commit(valid)).error).to.equal('NOT_EDITABLE');

    const saved = view;
    view = null;
    expect((await instance.ctx.commit(valid)).error).to.equal('NO_EDITOR');
    view = saved;
  });

  it('syncs selection both ways through resolve and locate', async () => {
    await attach();
    const [instance] = created;
    const seen = [];
    instance.ctx.onEditorSelect((itemId) => seen.push(itemId));

    expect(instance.ctx.select('/items/1')).to.equal(true);
    expect(view.state.selection).to.be.instanceOf(TextSelection);
    expect(view.state.selection.from).to.equal(textPos(view, 'Q2') + 1);
    canvasBus.editorSelectState.emit({ blockIndex: 1, source: 'doc' });
    expect(seen).to.deep.equal(['/items/1']);
    expect(instance.ctx.select('/items/9')).to.equal(false);

    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)));
    canvasBus.editorSelectState.emit({ blockIndex: -1, source: 'doc' });
    expect(seen).to.deep.equal(['/items/1', null]);
  });

  it('drops an operator that throws and falls back to the default', async () => {
    await attach();
    const [instance] = created;
    instance.update = () => { throw new Error('boom'); };
    view.dispatch(view.state.tr.insertText('!', textPos(view, 'A1')));
    host.sync();
    expect(instance.destroyed).to.equal(true);
    expect(host.getInstance(1)).to.equal(null);
    expect(host.mountOutline(1, document.createElement('div'))).to.equal(null);
  });

  it('destroys instances when the block goes away and on detach', async () => {
    await attach();
    const [instance] = created;
    const start = view.state.doc.child(0).nodeSize + view.state.doc.child(1).nodeSize;
    view.dispatch(view.state.tr.delete(start, start + view.state.doc.child(2).nodeSize));
    host.sync();
    expect(instance.destroyed).to.equal(true);
    host.detach();
  });

  it('serializes a block node as EDS markup with its variant', () => {
    const doc = makeRealView({ type: 'doc', content: [table('Cards (Dark, Wide)', row('One'))] });
    const html = blockNodeToHtml(doc.state.doc.child(0), doc.state.schema);
    expect(html).to.match(/^<div class="cards dark wide"><div><div>/);
    destroyView(doc);
  });
});
