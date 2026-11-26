import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

const { setNx, getNx2Api } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: init, routeDeps } = await import('../../../../blocks/sheet/sheet.js');
const { staleCheck } = await import('../../../../blocks/sheet/utils/utils.js');
const { source, config } = await getNx2Api();

const IMPORTED = { contentProfile: 'aem-import', readOnly: true, openKinds: ['image', 'sheet'], collaboration: false, branching: false };
const NATIVE = { contentProfile: 'native-da', readOnly: false, openKinds: ['page', 'sheet', 'image', 'asset'], collaboration: true, branching: true };
const sheetResp = (extra = {}) => new Response(JSON.stringify({
  total: 1,
  limit: 1,
  offset: 0,
  data: [{ 2: 'two', Key: '=SUM(A1)' }],
  ':type': 'sheet',
  'x-da-columns': ['Key', '2'],
  ...extra,
}), {
  status: 200,
  headers: {
    'content-type': 'application/json',
    'x-da-content-profile': 'aem-import',
    'x-da-source-kind': 'sheet',
    'x-da-source-collaboration': 'false',
  },
});

describe('sheet route init gating', () => {
  const { href } = window.location;
  const savedJspreadsheet = window.jspreadsheet;
  let ctx;

  const setup = (caps) => {
    const discover = sinon.stub(routeDeps, 'discover').resolves(caps);
    const fetchSpy = sinon.stub(window, 'fetch').rejects(new Error('unexpected network'));
    const ws = sinon.stub(window, 'WebSocket');
    const start = sinon.stub(staleCheck, 'start');
    const tabs = sinon.spy((container, data) => {
      container.innerHTML = `<div></div><div>${data.map(() => '<div class="jexcel_container"></div>').join('')}</div>`;
      container.jexcel = data.map((d) => ({ name: d.sheetName, options: d }));
    });
    window.jspreadsheet = { tabs };
    const listeners = [sinon.spy(window, 'addEventListener'), sinon.spy(document, 'addEventListener')];
    ctx = {
      discover, fetchSpy, ws, start, tabs, listeners,
    };
    return ctx;
  };

  afterEach(() => {
    ctx.listeners.forEach((spy) => spy.getCalls()
      .forEach(({ thisValue, args }) => thisValue.removeEventListener(...args)));
    sinon.restore();
    window.jspreadsheet = savedJspreadsheet;
    document.querySelectorAll('da-sheet-tabs, da-title').forEach((n) => n.remove());
    window.history.replaceState(null, '', href);
  });

  const rejected = (el) => {
    expect(el.textContent).to.contain('Unable to open');
    expect(el.querySelector('da-title')).to.equal(null);
    expect(ctx.start.called).to.be.false;
    expect(ctx.ws.called).to.be.false;
    expect(ctx.fetchSpy.called).to.be.false;
  };

  it('opens an imported sheet with only a Source GET and no room, save or tabs', async () => {
    setup(IMPORTED);
    const get = sinon.stub(source, 'get').resolves(sheetResp());
    const writes = ['put', 'post', 'delete', 'copy', 'move'].filter((m) => typeof source[m] === 'function')
      .map((m) => sinon.stub(source, m).rejects(new Error('write')));
    window.history.replaceState(null, '', '/sheet#/org/site/data/products');
    const el = document.createElement('div');
    await init(el);
    await new Promise((resolve) => { setTimeout(resolve, 50); });

    expect(ctx.discover.calledOnceWithExactly('org', 'site')).to.be.true;
    expect(get.calledOnce).to.be.true;
    expect(get.firstCall.args[0]).to.include({ org: 'org', site: 'site' });
    writes.forEach((w) => expect(w.called).to.be.false);
    expect(ctx.ws.called).to.be.false;
    ctx.fetchSpy.getCalls().forEach(({ args: [, opts] }) => {
      expect((opts?.method ?? 'GET').toUpperCase()).to.equal('GET');
    });
    expect(ctx.start.called).to.be.false;
    expect(ctx.tabs.calledOnce).to.be.true;
    expect(el.querySelector('da-branch-selector')).to.equal(null);
    const [options] = ctx.tabs.firstCall.args[1];
    expect(options.editable).to.equal(false);
    expect(options.data).to.deep.equal([['Key', '2'], ['=SUM(A1)', 'two']]);
    expect(el.querySelector('.da-sheet').classList.contains('is-content-fragment')).to.be.false;
    expect(document.querySelector('da-sheet-tabs')).to.equal(null);
  });

  it('renders content fragment columns without metadata and marks the grid for top alignment', async () => {
    setup(IMPORTED);
    sinon.stub(source, 'get').resolves(sheetResp({
      'x-da-columns': ['_path', '_model', '_title', '_variations', 'field:author', 'field:description'],
      data: [{ _title: 'Metadata', 'field:author': 'Ada', 'field:description': 'Line one\nLine two' }],
    }));
    window.history.replaceState(null, '', '/sheet#/demo/wknd/authors');
    const el = document.createElement('div');
    await init(el);
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    const [options] = ctx.tabs.firstCall.args[1];
    expect(options.data).to.deep.equal([['author', 'description'], ['Ada', 'Line one\nLine two']]);
    expect(options.editable).to.equal(false);
    expect(el.querySelector('.da-sheet').classList.contains('is-content-fragment')).to.be.true;
  });

  it('fails closed without a default sheet when the imported response is wrong', async () => {
    setup(IMPORTED);
    sinon.stub(source, 'get').resolves(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    window.history.replaceState(null, '', '/sheet#/org/site/data/products');
    const el = document.createElement('div');
    await init(el);
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    expect(ctx.tabs.called).to.be.false;
    expect(el.querySelector('.da-sheet').hidden).to.be.true;
    expect(el.querySelector('.da-sheet-not-permitted')).to.not.equal(null);
    expect(ctx.start.called).to.be.false;
  });

  it('rejects an imported config view before native initialization', async () => {
    setup(IMPORTED);
    const get = sinon.stub(config, 'get').resolves(new Response('{}'));
    const sget = sinon.stub(source, 'get').resolves(sheetResp());
    window.history.replaceState(null, '', '/config#/org/site');
    const el = document.createElement('div');
    await init(el);
    rejected(el);
    expect(get.called).to.be.false;
    expect(sget.called).to.be.false;
    expect(ctx.tabs.called).to.be.false;
  });

  it('rejects an imported branch URL against its base site before branch validation', async () => {
    setup(IMPORTED);
    const sget = sinon.stub(source, 'get').resolves(sheetResp());
    window.history.replaceState(null, '', '/sheet#/org/site~abc/data/products');
    const el = document.createElement('div');
    await init(el);
    expect(ctx.discover.calledOnceWithExactly('org', 'site')).to.be.true;
    rejected(el);
    expect(sget.called).to.be.false;
    expect(ctx.tabs.called).to.be.false;
  });

  it('rejects an imported site whose capabilities do not open Sheets', async () => {
    setup({ ...IMPORTED, openKinds: ['image'] });
    const sget = sinon.stub(source, 'get').resolves(sheetResp());
    window.history.replaceState(null, '', '/sheet#/org/site/data/products');
    const el = document.createElement('div');
    await init(el);
    rejected(el);
    expect(sget.called).to.be.false;
  });

  it('rejects when discovery fails instead of falling back to native', async () => {
    setup(IMPORTED);
    ctx.discover.rejects(new Error('capabilities unavailable'));
    const sget = sinon.stub(source, 'get').resolves(sheetResp());
    window.history.replaceState(null, '', '/sheet#/org/site/data/products');
    const el = document.createElement('div');
    await init(el);
    rejected(el);
    expect(sget.called).to.be.false;
  });

  it('keeps the native editable path for a genuinely native site', async () => {
    setup(NATIVE);
    sinon.stub(source, 'get').resolves({ ok: false, status: 403, permissions: [] });
    window.history.replaceState(null, '', '/sheet#/org/site/data/products');
    const el = document.createElement('div');
    const started = new Promise((resolve) => { ctx.start.callsFake(resolve); });
    await init(el);
    await started;
    expect(ctx.discover.calledOnceWithExactly('org', 'site')).to.be.true;
    expect(el.querySelector('da-title')).to.not.equal(null);
    expect(el.querySelector('da-branch-selector')).to.not.equal(null);
    expect(el.querySelector('.da-sheet').forceSave).to.be.a('function');
    expect(ctx.start.calledOnce).to.be.true;
  });
});
