import { expect } from '@esm-bundle/chai';
import { EditorState, EditorView } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../../../../scripts/utils.js';
import createSuggestionPlugin, { setSuggesting } from '../../../../../blocks/canvas/suggestions/suggestion-plugin.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { getInstrumentedHTML } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js');

const schema = getSchema();

// Layout mode ships this HTML to the quick-edit iframe over SET_BODY. It shows the
// approved page: a proposed insertion is not in it yet, a proposed deletion still is.
describe('suggestions in instrumented HTML', () => {
  let view;
  afterEach(() => view?.destroy());

  const mount = (text) => {
    const el = document.createElement('div');
    el.className = 'da-prose-mirror';
    document.body.append(el);
    view = new EditorView(el, {
      state: EditorState.create({
        doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])]),
        plugins: [createSuggestionPlugin({ username: 'ada' })],
      }),
    });
    return view;
  };

  it('leaves a proposed insertion out', () => {
    mount('Hello world');
    setSuggesting(view, true);
    view.dispatch(view.state.tr.insertText(' brave', 6));
    const html = getInstrumentedHTML(view);
    expect(html).to.not.contain('da-suggestion-added');
    expect(html).to.not.contain('brave');
    expect(html).to.contain('Hello');
  });

  it('keeps text proposed for deletion, as plain text', () => {
    mount('Hello cruel world');
    setSuggesting(view, true);
    view.dispatch(view.state.tr.delete(6, 12));
    const html = getInstrumentedHTML(view);
    expect(html).to.not.contain('da-suggestion-deleted');
    expect(html).to.contain('cruel');
  });
});
