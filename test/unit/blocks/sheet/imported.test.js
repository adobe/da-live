import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const {
  validateImportedResponse, parseImportedEnvelope, buildImportedSheet, installImportedGuards,
  ImportedSheetError, MAX_IMPORTED_ROWS,
} = await import('../../../../blocks/sheet/utils/imported.js');
const { initImported } = await import('../../../../blocks/sheet/utils/index.js');

const HEADERS = {
  'x-da-content-profile': 'aem-import',
  'x-da-source-kind': 'sheet',
  'x-da-source-collaboration': 'false',
  'content-type': 'application/json; charset=utf-8',
};
const okResp = (headers = {}) => new Response('{}', { status: 200, headers: { ...HEADERS, ...headers } });
const envelope = (extra = {}) => ({
  total: 1, limit: 1, offset: 0, data: [{ Key: '001', Text: '' }], ':type': 'sheet', 'x-da-columns': ['Key', 'Text'], ...extra,
});

describe('imported sheet response validation', () => {
  it('accepts a coherent imported sheet response', () => {
    expect(() => validateImportedResponse(okResp())).to.not.throw();
  });

  [
    ['profile', { 'x-da-content-profile': 'native-da' }],
    ['missing profile', { 'x-da-content-profile': '' }],
    ['kind', { 'x-da-source-kind': 'page' }],
    ['collaboration', { 'x-da-source-collaboration': 'true' }],
    ['content type', { 'content-type': 'text/html' }],
  ].forEach(([name, headers]) => {
    it(`fails closed on bad ${name}`, () => {
      expect(() => validateImportedResponse(okResp(headers))).to.throw(ImportedSheetError);
    });
  });

  it('fails closed on non-ok statuses', () => {
    [401, 403, 404, 500].forEach((status) => {
      expect(() => validateImportedResponse(new Response('', { status }))).to.throw(ImportedSheetError);
    });
    expect(() => validateImportedResponse(undefined)).to.throw(ImportedSheetError);
  });
});

describe('imported sheet envelope', () => {
  it('maps rows by x-da-columns, not object key order', () => {
    const { columns, rows } = parseImportedEnvelope(envelope({ data: [{ Text: 't', Key: 'k' }] }));
    expect(columns).to.deep.equal(['Key', 'Text']);
    expect(rows).to.deep.equal([['k', 't']]);
  });

  it('handles numeric-looking keys in declared order', () => {
    const json = JSON.parse('{":type":"sheet","x-da-columns":["10","2","a"],"data":[{"2":"two","a":"A","10":"ten"}]}');
    expect(parseImportedEnvelope(json).rows).to.deep.equal([['ten', 'two', 'A']]);
  });

  it('keeps declared headers for zero rows', () => {
    const parsed = parseImportedEnvelope(envelope({ data: [], total: 0, limit: 0 }));
    expect(parsed.columns).to.deep.equal(['Key', 'Text']);
    expect(parsed.rows).to.deep.equal([]);
    expect(buildImportedSheet(parsed).data).to.deep.equal([['Key', 'Text']]);
  });

  it('fills absent cells and stringifies scalars and structures', () => {
    const data = [{ Key: 1, Text: null }, { Key: true }, { Key: { a: 1 }, Text: [1] }];
    const { rows } = parseImportedEnvelope(envelope({ data }));
    expect(rows).to.deep.equal([['1', ''], ['true', ''], ['{"a":1}', '[1]']]);
  });

  it('returns no grid options for zero columns', () => {
    expect(buildImportedSheet(parseImportedEnvelope(envelope({ 'x-da-columns': [], data: [] })))).to.equal(null);
  });

  it('keeps formula-looking and html strings as plain data', () => {
    const { rows } = parseImportedEnvelope(envelope({ data: [{ Key: '=SUM(A1)', Text: '<img src=x onerror=alert(1)>' }] }));
    expect(rows[0]).to.deep.equal(['=SUM(A1)', '<img src=x onerror=alert(1)>']);
  });

  [
    ['wrong type', { ':type': 'multi-sheet' }],
    ['multi-sheet', { ':names': ['a'] }],
    ['private sheets', { ':private': {} }],
    ['missing columns', { 'x-da-columns': undefined }],
    ['non-string column', { 'x-da-columns': ['a', 1] }],
    ['non-array data', { data: {} }],
    ['array row', { data: [[1]] }],
    ['too many rows', { data: new Array(MAX_IMPORTED_ROWS + 1).fill({}) }],
  ].forEach(([name, extra]) => {
    it(`rejects ${name}`, () => {
      expect(() => parseImportedEnvelope(envelope(extra))).to.throw(ImportedSheetError);
    });
  });

  it('rejects non-objects', () => {
    [null, [], 'x', 1].forEach((v) => expect(() => parseImportedEnvelope(v)).to.throw(ImportedSheetError));
  });
});

describe('imported grid options', () => {
  const options = buildImportedSheet(parseImportedEnvelope(envelope()));

  it('disables every mutation path and registers no save hooks', () => {
    expect(options.editable).to.equal(false);
    expect(options.parseFormulas).to.equal(false);
    ['allowInsertRow', 'allowManualInsertRow', 'allowInsertColumn', 'allowManualInsertColumn',
      'allowDeleteRow', 'allowDeleteColumn', 'allowRenameColumn', 'columnDrag', 'rowDrag',
      'columnResize', 'rowResize'].forEach((key) => expect(options[key], key).to.equal(false));
    ['onafterchanges', 'ondeleterow', 'ondeletecolumn', 'onmoverow', 'oninsertrow', 'oninsertcolumn']
      .forEach((key) => expect(options[key], key).to.equal(undefined));
    expect(options.onbeforepaste()).to.equal(false);
    options.columns.forEach((col) => expect(col.readOnly).to.equal(true));
  });
});

describe('imported guards', () => {
  let root;
  let uninstall;
  beforeEach(() => {
    root = document.createElement('div');
    document.body.append(root);
    uninstall = installImportedGuards(root);
  });
  afterEach(() => {
    uninstall();
    root.remove();
  });

  it('blocks delete, save, paste and cut but allows copy and navigation', () => {
    const seen = sinon.spy();
    document.addEventListener('keydown', seen);
    const key = (init) => {
      const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
      root.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(key({ key: 'Delete' })).to.be.true;
    expect(key({ key: 'Backspace' })).to.be.true;
    expect(key({ key: 's', ctrlKey: true })).to.be.true;
    expect(key({ key: 'v', metaKey: true })).to.be.true;
    expect(seen.callCount).to.equal(0);
    expect(key({ key: 'c', ctrlKey: true })).to.be.false;
    expect(key({ key: 'ArrowDown' })).to.be.false;
    expect(seen.callCount).to.equal(2);
    document.removeEventListener('keydown', seen);
    ['paste', 'cut', 'drop'].forEach((name) => {
      const e = new Event(name, { bubbles: true, cancelable: true });
      root.dispatchEvent(e);
      expect(e.defaultPrevented, name).to.be.true;
    });
  });
});

describe('imported initialization', () => {
  let saved;
  let tabsCalls;
  beforeEach(() => {
    saved = window.jspreadsheet;
    tabsCalls = [];
    window.jspreadsheet = {
      tabs: (container, data) => {
        tabsCalls.push(data);
        container.innerHTML = `<div></div><div>${data.map(() => '<div class="jexcel_container"></div>').join('')}</div>`;
        container.jexcel = data.map((d) => ({ name: d.sheetName, options: d }));
      },
    };
  });
  afterEach(() => { window.jspreadsheet = saved; });

  it('creates a single read-only grid, no tabs element and no network', async () => {
    const fetchSpy = sinon.spy(window, 'fetch');
    try {
      const el = document.createElement('div');
      document.body.append(el);
      const options = buildImportedSheet(parseImportedEnvelope(envelope()));
      const grid = await initImported(el, options);
      expect(grid).to.have.length(1);
      expect(tabsCalls[0]).to.deep.equal([options]);
      expect(document.querySelector('da-sheet-tabs')).to.equal(null);
      expect(grid[0].options.onafterchanges).to.equal(undefined);
      expect(fetchSpy.called).to.be.false;
      el.remove();
    } finally {
      fetchSpy.restore();
    }
  });

  it('ignores a stale initialization', async () => {
    const el = document.createElement('div');
    const grid = await initImported(
      el,
      buildImportedSheet(parseImportedEnvelope(envelope())),
      () => false,
    );
    expect(grid).to.equal(null);
    expect(tabsCalls).to.have.length(0);
  });
});
