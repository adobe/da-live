import { expect } from '@esm-bundle/chai';
import { TextSelection } from 'da-y-wrapper';
import {
  getURLInputRule,
  getDashesInputRule,
  getEnterInputRulesPlugin,
  getURLInputRulesPlugin,
  getListInputRulesPlugin,
  handleTableTab,
} from '../../../../../../blocks/edit/prose/plugins/keyHandlers.js';
import { createTestEditor, destroyEditor } from '../test-helpers.js';

function setParagraph(view, text) {
  const { state, dispatch } = view;
  const tr = state.tr.replaceWith(
    0,
    state.doc.content.size,
    state.schema.nodes.paragraph.create(null, text ? state.schema.text(text) : null),
  );
  dispatch(tr);
}

describe('keyHandlers URL input rule', () => {
  let editor;
  let urlRule;

  beforeEach(async () => {
    editor = await createTestEditor();
    urlRule = getURLInputRule();
  });

  afterEach(() => destroyEditor(editor));

  it('Replaces a typed URL with a linked text node', () => {
    setParagraph(editor.view, 'see https://example.com/path ');
    const { state } = editor.view;
    const match = 'https://example.com/path '.match(urlRule.match);
    const tr = urlRule.handler(state, match, 5, state.doc.content.size - 1);
    expect(tr).to.not.equal(null);
    const newState = state.apply(tr);
    let foundLink = false;
    newState.doc.descendants((node) => {
      if (node.isText && (node.marks || []).some((m) => m.type.name === 'link')) {
        foundLink = true;
      }
    });
    expect(foundLink).to.be.true;
  });

  it('Returns null for non-URL strings', () => {
    setParagraph(editor.view, 'hello not-a-url ');
    const { state } = editor.view;
    // simulate a fake match where match[0] is not a URL
    const fakeMatch = ['not-a-url '];
    const tr = urlRule.handler(state, fakeMatch, 7, state.doc.content.size);
    expect(tr).to.equal(null);
  });
});

describe('keyHandlers list input rules', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor();
  });

  afterEach(() => destroyEditor(editor));

  it('Returns a plugin object with input rules', () => {
    const plugin = getListInputRulesPlugin(editor.view.state.schema);
    expect(plugin).to.exist;
    expect(plugin.props).to.exist;
  });
});

describe('keyHandlers URL input rules plugin', () => {
  it('Returns a plugin', () => {
    const plugin = getURLInputRulesPlugin();
    expect(plugin).to.exist;
    expect(plugin.props).to.exist;
  });
});

describe('keyHandlers Enter input rules plugin', () => {
  it('handleKeyDown ignores non-Enter events', () => {
    const plugin = getEnterInputRulesPlugin(() => {});
    const { handleKeyDown } = plugin.props;
    // Build a minimal fake view that satisfies handleKeyDown's accesses
    const fakeView = { state: { selection: {} } };
    expect(handleKeyDown(fakeView, { key: 'A' })).to.be.false;
  });

  it('handleKeyDown returns false when no $cursor is present', () => {
    const plugin = getEnterInputRulesPlugin(() => {});
    const { handleKeyDown } = plugin.props;
    const fakeView = { state: { selection: { $cursor: null } } };
    expect(handleKeyDown(fakeView, { key: 'Enter' })).to.be.false;
  });

  it('consumes Enter after three dashes with exactly one transaction', async () => {
    const editor = await createTestEditor();
    try {
      const { view } = editor;
      setParagraph(view, '---');
      const plugin = getEnterInputRulesPlugin();
      view.updateState(view.state.reconfigure({ plugins: [plugin] }));
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4)));
      let dispatches = 0;
      const handled = plugin.props.handleKeyDown({
        state: view.state,
        composing: false,
        dispatch: (tr) => { dispatches += 1; view.dispatch(tr); },
      }, { key: 'Enter' });

      expect(handled).to.be.true;
      expect(dispatches).to.equal(1);
      const separators = [];
      view.state.doc.descendants((node) => {
        if (node.type.name === 'horizontal_rule') separators.push(node);
      });
      expect(separators).to.have.lengthOf(1);
      expect(view.state.doc.textContent).to.equal('');
    } finally {
      destroyEditor(editor);
    }
  });
});

describe('keyHandlers dashes input rule', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor();
    setParagraph(editor.view, '---\n');
    // place cursor at the end
    const tr = editor.view.state.tr.setSelection(
      TextSelection.create(editor.view.state.doc, editor.view.state.doc.content.size - 1),
    );
    editor.view.dispatch(tr);
  });

  afterEach(() => destroyEditor(editor));

  it('Returns a transaction with a replaced HR node', () => {
    const rule = getDashesInputRule();
    // simulate the rule handler
    const transaction = rule.handler(editor.view.state, ['---\n'], 1, 5);
    expect(transaction).to.exist;
    const newState = editor.view.state.apply(transaction);
    let hasHr = false;
    newState.doc.descendants((node) => {
      if (node.type.name === 'horizontal_rule') hasHr = true;
    });
    expect(hasHr).to.be.true;
  });
});

function buildTable(view, rows, width) {
  const { state, dispatch } = view;
  const { schema } = state;
  const { table, table_row: tableRow, table_cell: tableCell, paragraph } = schema.nodes;
  const tableRows = rows.map((row) => tableRow.create(null, row.map((text) => tableCell.create(
    row.length === 1 && width > 1 ? { colspan: width, colwidth: null } : null,
    paragraph.create(null, schema.text(text)),
  ))));
  dispatch(state.tr.replaceWith(0, state.doc.content.size, table.create(null, tableRows)));
}

function placeCursorIn(view, text) {
  let found;
  view.state.doc.descendants((node, pos) => {
    if (!found && node.isText && node.text === text) found = pos;
  });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, found)));
}

function pressTab(view) {
  return handleTableTab(1)(view.state, view.dispatch, view);
}

function lastRowColspans(view) {
  const spans = [];
  view.state.doc.firstChild.lastChild.forEach((cell) => spans.push(cell.attrs.colspan));
  return spans;
}

describe('handleTableTab', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor();
  });

  afterEach(() => destroyEditor(editor));

  it('adds a row when tabbing from the last cell of a multi-cell row', () => {
    const { view } = editor;
    buildTable(view, [['block'], ['a', 'b']], 2);
    placeCursorIn(view, 'b');

    expect(pressTab(view)).to.be.true;
    expect(lastRowColspans(view)).to.deep.equal([1, 1]);
    expect(view.state.doc.firstChild.childCount).to.equal(3);
    expect(view.state.selection.$from.node(-2)).to.equal(view.state.doc.firstChild.lastChild);
  });

  it('adds a row when tabbing from a single merged cell in the last row', () => {
    const { view } = editor;
    buildTable(view, [['block'], ['a', 'b'], ['last']], 2);
    placeCursorIn(view, 'last');

    expect(pressTab(view)).to.be.true;
    expect(lastRowColspans(view)).to.deep.equal([2]);
    expect(view.state.doc.firstChild.childCount).to.equal(4);
    expect(view.state.selection.$from.node(-2)).to.equal(view.state.doc.firstChild.lastChild);
  });

  it('adds a row when tabbing from the last row of a single-column table', () => {
    const { view } = editor;
    buildTable(view, [['block'], ['only']], 1);
    placeCursorIn(view, 'only');

    expect(pressTab(view)).to.be.true;
    expect(lastRowColspans(view)).to.deep.equal([1]);
    expect(view.state.doc.firstChild.childCount).to.equal(3);
    expect(view.state.selection.$from.node(-2)).to.equal(view.state.doc.firstChild.lastChild);
  });

  it('falls back to a full-width row when a cell above spans into the last row', () => {
    const { view } = editor;
    const { schema } = view.state;
    const { table, table_row: tableRow, table_cell: tableCell, paragraph } = schema.nodes;
    const cell = (text, attrs) => tableCell.create(
      attrs,
      paragraph.create(null, schema.text(text)),
    );
    const doc = table.create(null, [
      tableRow.create(null, [cell('block', { colspan: 2 })]),
      tableRow.create(null, [cell('tall', { rowspan: 2 }), cell('b')]),
      tableRow.create(null, [cell('c')]),
    ]);
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, doc));
    placeCursorIn(view, 'c');

    expect(pressTab(view)).to.be.true;
    expect(view.state.doc.firstChild.childCount).to.equal(4);
    expect(lastRowColspans(view)).to.deep.equal([1, 1]);
    expect(view.state.selection.$from.node(-2)).to.equal(view.state.doc.firstChild.lastChild);
  });
});
