import { expect } from '@esm-bundle/chai';
import { html, render } from 'da-lit';
import { fieldStates, pendingChanges } from '../../../../blocks/config/editors/settings.js';
import {
  rowStates, cleanRow, rowErrors, renderRowDialog, renderRows, cellText, listColumns,
} from '../../../../blocks/config/editors/rows.js';
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

  describe('table', () => {
    const panel = {
      noun: 'plugin',
      idKey: 'title',
      columns: [
        { key: 'title', label: 'Title' },
        { key: 'path', label: 'Path' },
        { key: 'experience', label: 'Opens in', options: [{ value: 'window', label: 'New window' }] },
        { key: 'secret', label: 'Secret', list: false },
      ],
    };
    const T = { title: 'Tool', path: '/tools/t.html', experience: 'window', secret: 'x' };
    const O = { title: 'Org tool', path: '/o.html', experience: 'unknown' };
    const table = (items, handlers = {}) => {
      const el = document.createElement('div');
      const noop = () => {};
      const all = { onAdd: noop, onEdit: noop, onRemove: noop, onOverride: noop, ...handlers };
      render(renderRows(panel, { items }, all), el);
      const cells = (tr) => [...tr.querySelectorAll('th, td:not(.config-table-actions)')]
        .map((c) => c.textContent.replace(/\s+/g, ' ').trim());
      return {
        headers: [...el.querySelectorAll('thead th')].map((th) => th.textContent.trim()),
        rows: [...el.querySelectorAll('tbody tr')].map(cells),
        buttons: [...el.querySelectorAll('tbody button')].map((b) => b.getAttribute('aria-label') ?? b.textContent.trim()),
        el,
      };
    };

    it('labels columns, shows option labels and hides list: false columns', () => {
      expect(listColumns(panel).map((c) => c.key)).to.deep.equal(['title', 'path', 'experience']);
      expect([cellText(panel.columns[2], T), cellText(panel.columns[2], O)]).to.deep.equal(['New window', 'unknown']);
      const { headers, rows } = table([{ row: T, index: 0 }]);
      expect(headers).to.deep.equal(['Title', 'Path', 'Opens in', 'Row actions']);
      expect(rows).to.deep.equal([['Tool', '/tools/t.html', 'New window']]);
    });

    it('marks inherited and overriding rows and offers the matching actions', () => {
      const { rows, buttons, el } = table([
        { row: O, inherited: true },
        { row: T, index: 0, overrides: true },
      ]);
      const pills = [...el.querySelectorAll('tbody tr')]
        .map((tr) => [...tr.querySelectorAll('nx-pills')].map((p) => p.items[0].label));
      expect(rows.map((r) => r[0])).to.deep.equal(['Org tool', 'Tool']);
      expect(pills).to.deep.equal([['Inherited from org'], ['Overrides org']]);
      expect(buttons).to.deep.equal(['Override', 'Edit Tool', 'Delete Tool']);
      expect(el.querySelector('tbody tr').classList.contains('is-inherited')).to.equal(true);
    });

    it('shows full URLs without their scheme, breakable after each slash', () => {
      const path = { key: 'path', label: 'Path' };
      expect(cellText(path, { path: 'https://content.da.live/o/s/docs/library/blocks/cards' }))
        .to.equal('content.da.live/o/s/docs/library/blocks/cards');
      expect(cellText(path, { path: 'https://a.com/x/y.html, http://b.com/q.html' })).to.equal('a.com/x/y.html, b.com/q.html');
      expect(cellText(path, { path: '/tools/plugins/tags/tags.html' })).to.equal('/tools/plugins/tags/tags.html');
      const url = 'https://da.live/nx/public/plugins/media-library/media-library.html';
      const { rows, el } = table([{ row: { ...T, path: url }, index: 0 }]);
      expect(rows[0][1]).to.equal('da.live/nx/public/plugins/media-library/media-library.html');
      expect(el.querySelectorAll('tbody td:nth-of-type(1) wbr').length).to.equal(6);
    });

    it('shows an empty state with how to start, and only the title without edit access', () => {
      const empty = (handlers) => {
        const { el } = table([], handlers);
        return [...el.querySelectorAll('.config-empty p')].map((p) => p.textContent.trim());
      };
      expect(empty({})).to.deep.equal(['No plugins yet', 'Add a plugin to get started.']);
      expect(empty({ disabled: true })).to.deep.equal(['No plugins yet']);
    });

    it('puts the list actions above the table, with Add last', () => {
      const { el } = table([{ row: T, index: 0 }], { actions: html`<button type="button">Import</button>` });
      const order = [...el.children].map((child) => child.className);
      expect(order).to.deep.equal(['config-row-buttons', 'config-table-wrap']);
      const labels = [...el.querySelectorAll('.config-row-buttons button')].map((b) => b.textContent.trim());
      expect(labels).to.deep.equal(['Import', 'Add plugin']);
    });

    it('drops the actions column when editing is off', () => {
      const { headers, buttons, el } = table([{ row: T, index: 0 }], { disabled: true });
      expect(headers).to.deep.equal(['Title', 'Path', 'Opens in']);
      expect([buttons, !!el.querySelector('.config-row-buttons')]).to.deep.equal([[], false]);
    });
  });

  it('lays fields out like Spectrum: label with *, control, then help text an error replaces', () => {
    const handlers = { onChange: () => {}, onApply: () => {}, onCancel: () => {} };
    const field = (draft, errors = {}) => {
      const el = document.createElement('div');
      render(renderRowDialog(prepare, draft, errors, handlers), el);
      const label = el.querySelector('.nx-form-field');
      return {
        order: [...label.children].map((c) => c.className || c.tagName.toLowerCase()),
        label: label.querySelector('.config-field-label').textContent.replace(/\s+/g, ''),
        required: label.querySelector('input').required,
        help: label.querySelector('.config-field-help')?.textContent.trim() ?? null,
        error: label.querySelector('.nx-input-error-msg')?.textContent.trim() ?? null,
      };
    };
    const clean = field({ index: null, row: {} });
    expect([clean.order, clean.label, clean.required]).to.deep.equal([['config-field-label', 'nx-input', 'config-field-help'], 'Title*', true]);
    expect([clean.help !== null, clean.error]).to.deep.equal([true, null]);
    const invalid = field({ index: null, row: {}, submitted: true }, { title: 'Enter a title.' });
    expect([invalid.help, invalid.error]).to.deep.equal([null, 'Enter a title.']);
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
  // A status renders as [note, block]: info-box text, or a standalone error/setup box.
  const parts = ({ note, block }) => [text(note), text(block)];
  const opts = { org: 'o', site: 's', locked: false, onSetup: () => {} };

  it('describes a fixed file in the info box, and a failure on its own', () => {
    const path = '/.da/translate.json';
    expect(parts(renderFileStatus(null, opts))).to.deep.equal(['Loading…', '']);
    expect(parts(renderFileStatus({ status: 'error', path, httpStatus: 500 }, opts)))
      .to.deep.equal(['', `Could not load ${path} The server responded with 500.`]);
    expect(parts(renderFileStatus({ status: 'ok', path, missing: true }, opts))[0]).to.include('doesn\'t exist yet');
    expect(parts(renderFileStatus({ status: 'ok', path, missing: false }, opts))).to.deep.equal(['', '']);
  });

  it('explains how Set up picks a library file, as its own block', () => {
    const [note, one] = parts(renderLibraryStatus(library('Placeholders', ['/placeholders.json']), { status: 'unregistered' }, opts));
    expect([note, one.includes('creates it if it doesn\'t exist')]).to.deep.equal(['', true]);
    const [, two] = parts(renderLibraryStatus(library('Icons'), { status: 'unregistered' }, opts));
    expect(two).to.include('When neither exists');
  });

  it('notes when a library list needs publishing, and reports one that cannot be read', () => {
    const ok = { status: 'ok', path: '/docs/library/icons.json', registered: '/docs/library/icons.json' };
    expect(parts(renderLibraryStatus(library('Icons'), ok, opts))[0]).to.include('previewed and published');
    const live = { ...ok, registered: 'https://content.da.live/o/s/docs/library/icons.json' };
    expect(parts(renderLibraryStatus(library('Icons'), live, opts))).to.deep.equal(['', '']);
    const lib = { status: 'error', path: '/library/icons.json', httpStatus: 503 };
    expect(parts(renderLibraryStatus(library('Icons'), lib, opts))[1]).to.include('responded with 503');
  });
});
