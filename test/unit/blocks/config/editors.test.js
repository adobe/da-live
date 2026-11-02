import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { fieldStates, pendingChanges } from '../../../../blocks/config/editors/settings.js';
import { rowStates, cleanRow, rowErrors, renderRowDialog } from '../../../../blocks/config/editors/rows.js';
import prepare from '../../../../blocks/config/panels/prepare.js';
import { renderFileStatus, renderLibraryStatus } from '../../../../blocks/config/editors/file-status.js';
import { library } from '../../../../blocks/config/stores.js';

const sheet = (rows) => ({ data: rows, ':type': 'sheet' });
const multi = (name, rows) => ({ [name]: { data: rows }, ':names': [name], ':type': 'multi-sheet' });

describe('settings field states', () => {
  const fields = [
    { key: 'id', label: 'ID', required: true, validate: (v) => (v === 'bad' ? 'nope' : null) },
    { key: 'opt', label: 'Opt' },
  ];
  const byKey = (states) => Object.fromEntries(states.map((s) => [s.field.key, s]));

  it('ignores whitespace and non-string values in the saved sheet', () => {
    const own = sheet([{ key: 'id', value: ' x ' }, { key: 'opt', value: 3 }]);
    const inherited = sheet([{ key: 'opt', value: ' org ' }]);
    const states = byKey(fieldStates(fields, { own, inherited, edits: {}, sheet: 'data' }));
    const { id, opt } = states;
    expect([id.value, id.dirty, opt.value, opt.dirty, opt.orgValue])
      .to.deep.equal(['x', false, '3', false, 'org']);
    const spaced = byKey(fieldStates(fields, { own, inherited: null, edits: { id: 'x  ' }, sheet: 'data' }));
    expect(spaced.id.dirty).to.equal(false);
    expect(pendingChanges(Object.values(spaced))).to.deep.equal({});
  });

  it('shows saved values at org scope without inheritance', () => {
    const { id } = byKey(fieldStates(fields, { sheet: 'data', own: sheet([{ key: 'id', value: 'x' }]), inherited: null, edits: {} }));
    expect([id.value, id.dirty, id.overridden, id.inherits]).to.deep.equal(['x', false, false, false]);
  });

  it('marks site values that override the org and empty ones that inherit', () => {
    const states = byKey(fieldStates(fields, {
      sheet: 'data',
      own: sheet([{ key: 'id', value: 'site' }]),
      inherited: sheet([{ key: 'id', value: 'org' }, { key: 'opt', value: 'org-opt' }]),
      edits: {},
    }));
    expect([states.id.overridden, states.id.orgValue]).to.deep.equal([true, 'org']);
    expect([states.opt.inherits, states.opt.value]).to.deep.equal([true, '']);
  });

  it('trims edits, flags dirty fields, and keeps the raw text for the input', () => {
    const states = fieldStates(fields, { sheet: 'data', own: null, inherited: null, edits: { opt: ' v ' } });
    expect(byKey(states).opt).to.include({ raw: ' v ', value: 'v', dirty: true });
    expect(pendingChanges(states)).to.deep.equal({ opt: 'v' });
  });

  it('reads from the given sheet', () => {
    const own = multi('flags', [{ key: 'opt', value: 'f' }]);
    const [, opt] = fieldStates(fields, { own, inherited: null, edits: {}, sheet: 'flags' });
    expect(opt.value).to.equal('f');
  });

  it('validates non-empty values and requires a cleared required field with no org value', () => {
    const invalid = byKey(fieldStates(fields, { sheet: 'data', own: null, inherited: null, edits: { id: 'bad' } }));
    expect(invalid.id.error).to.equal('nope');
    const cleared = byKey(fieldStates(fields, { sheet: 'data', own: sheet([{ key: 'id', value: 'x' }]), inherited: null, edits: { id: '' } }));
    expect(cleared.id.error).to.equal('ID is required.');
    const inherited = byKey(fieldStates(fields, {
      sheet: 'data',
      own: sheet([{ key: 'id', value: 'x' }]),
      inherited: sheet([{ key: 'id', value: 'org' }]),
      edits: { id: '' },
    }));
    expect(inherited.id.error).to.equal(null);
  });
});

describe('rows', () => {
  const A = { title: 'A', path: 'https://x.com/a.html' };
  const B = { title: 'B', path: 'https://x.com/b.html' };
  const A2 = { title: 'A', path: 'https://x.com/a2.html' };
  const C = { title: 'C', path: 'https://x.com/c.html' };

  it('lists org rows, replaced by site rows with the same title, then site-only rows', () => {
    const scoped = { own: multi('prepare', [C, A2]), inherited: multi('prepare', [A, B]), pending: null };
    const { items, rows } = rowStates(prepare, { ...scoped, sheet: 'prepare' });
    expect(rows).to.deep.equal([C, A2]);
    expect(items).to.deep.equal([
      { row: A2, index: 1, overrides: true },
      { row: B, inherited: true },
      { row: C, index: 0 },
    ]);
  });

  it('marks pending rows dirty only when they differ from the saved rows', () => {
    const own = multi('prepare', [A]);
    expect(rowStates(prepare, { own, inherited: null, pending: [A], sheet: 'prepare' }).dirty).to.equal(false);
    expect(rowStates(prepare, { own, inherited: null, pending: [A, B], sheet: 'prepare' }).dirty).to.equal(true);
  });

  it('focuses the first field when the dialog opens', () => {
    const el = document.createElement('div');
    const handlers = { onChange: () => {}, onApply: () => {}, onCancel: () => {} };
    render(renderRowDialog(prepare, { index: null, row: {} }, {}, handlers), el);
    const inputs = [...el.querySelectorAll('input, textarea, nx-picker')];
    const focused = inputs.map((input) => input.hasAttribute('autofocus'));
    expect(focused).to.deep.equal(inputs.map((_, i) => i === 0));
  });

  it('reads rows from the given sheet only', () => {
    const own = multi('prepare', [A]);
    expect(rowStates(prepare, { own, inherited: null, pending: null, sheet: 'apps' }).rows).to.deep.equal([]);
  });

  it('trims values and drops empty columns', () => {
    expect(cleanRow({ title: ' A ', path: '', ref: '  ' })).to.deep.equal({ title: 'A' });
  });

  it('flags a title already used by another editable row', () => {
    expect(rowErrors(prepare, [A, B], { index: 1, row: { ...B, title: 'A' } })).to.have.keys('title');
    expect(rowErrors(prepare, [A, B], { index: 0, row: A })).to.deep.equal({});
  });
});

describe('file status', () => {
  const text = (template) => {
    const el = document.createElement('div');
    render(template, el);
    return el.textContent.replace(/\s+/g, ' ').trim();
  };
  const opts = { org: 'o', site: 's', locked: false, onSetup: () => {} };

  it('describes a fixed file while loading, failing, missing and found', () => {
    const path = '/.da/translate.json';
    expect(text(renderFileStatus(null, opts))).to.equal('Loading…');
    expect(text(renderFileStatus({ status: 'error', path, httpStatus: 500 }, opts))).to.include('(500)');
    expect(text(renderFileStatus({ status: 'ok', path, missing: true }, opts))).to.include('doesn\'t exist yet');
    expect(text(renderFileStatus({ status: 'ok', path, missing: false }, opts))).to.include(`Stored in ${path}`);
  });

  it('explains how Set up picks a library file', () => {
    const one = text(renderLibraryStatus(library('Placeholders', ['/placeholders.json']), { status: 'unregistered' }, opts));
    expect(one).to.include('creates it if it doesn\'t exist');
    const two = text(renderLibraryStatus(library('Icons'), { status: 'unregistered' }, opts));
    expect(two).to.include('When neither exists');
  });

  it('reports a library file that cannot be read', () => {
    const lib = { status: 'error', path: '/library/icons.json', httpStatus: 503 };
    expect(text(renderLibraryStatus(library('Icons'), lib, opts))).to.include('(503)');
  });
});
