import { expect } from '@esm-bundle/chai';
import { EditorState, EditorView } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../../../../scripts/utils.js';
import createSuggestionPlugin, { setSuggesting } from '../../../../../blocks/canvas/suggestions/suggestion-plugin.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { getInstrumentedHTML } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js');

const schema = getSchema();

// Layout mode ships this HTML to the quick-edit iframe over SET_BODY, so the
// suggestion marks have to survive serialization or they render as plain text.
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

  it('keeps an insertion as a da-suggestion-added element', () => {
    mount('Hello world');
    setSuggesting(view, true);
    view.dispatch(view.state.tr.insertText(' brave', 6));
    expect(getInstrumentedHTML(view)).to.contain('da-suggestion-added');
  });

  it('keeps a deletion as a da-suggestion-deleted element', () => {
    mount('Hello cruel world');
    setSuggesting(view, true);
    view.dispatch(view.state.tr.delete(6, 12));
    const html = getInstrumentedHTML(view);
    expect(html).to.contain('da-suggestion-deleted');
    expect(html).to.contain('cruel');
  });
});
