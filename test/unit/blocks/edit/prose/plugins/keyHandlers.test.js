import { expect } from '@esm-bundle/chai';
import { TextSelection } from 'da-y-wrapper';
import {
  getURLInputRule,
  getDashesInputRule,
  getEnterInputRulesPlugin,
  getURLInputRulesPlugin,
  getListInputRulesPlugin,
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

  it('Calls dispatchTransaction with a replaced HR node', () => {
    let dispatched;
    const rule = getDashesInputRule((tr) => { dispatched = tr; });
    // simulate the rule handler
    rule.handler(editor.view.state, ['---\n'], 1, 5);
    expect(dispatched).to.exist;
    const newState = editor.view.state.apply(dispatched);
    let hasHr = false;
    newState.doc.descendants((node) => {
      if (node.type.name === 'horizontal_rule') hasHr = true;
    });
    expect(hasHr).to.be.true;
  });
});
