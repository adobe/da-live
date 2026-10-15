/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { EditorState, EditorView, TextSelection } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
import createSuggestionPlugin, {
  setSuggesting,
  listSuggestions,
} from '../../../../../blocks/canvas/suggestions/suggestion-plugin.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const schema = getSchema();

before(async () => {
  await import('../../../../../blocks/canvas/ew-editor-doc/ew-editor-doc.js');
});

const editorWith = (text) => {
  const host = document.createElement('div');
  document.body.append(host);
  return new EditorView(host, {
    state: EditorState.create({
      doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])]),
      plugins: [createSuggestionPlugin({ username: 'Ada' })],
    }),
  });
};

describe('listSuggestions', () => {
  let view;
  afterEach(() => view?.destroy());

  it('describes a replacement with both halves', () => {
    view = editorWith('Lorem ipsum');
    setSuggesting(view, true);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 7, 12)));
    view.dispatch(view.state.tr.replaceSelectionWith(schema.text('jsdfjsdfds'), false));

    const [item] = listSuggestions(view.state.doc);
    expect(item.kind).to.equal('replace');
    expect(item.deleted).to.equal('ipsum');
    expect(item.inserted).to.equal('jsdfjsdfds');
    expect(item.username).to.equal('Ada');
  });

  it('describes a pure deletion', () => {
    view = editorWith('Hello cruel world');
    setSuggesting(view, true);
    view.dispatch(view.state.tr.delete(7, 13));
    const [item] = listSuggestions(view.state.doc);
    expect(item.kind).to.equal('delete');
    expect(item.deleted).to.equal('cruel ');
  });

  it('describes a pure insertion', () => {
    view = editorWith('Hello world');
    setSuggesting(view, true);
    view.dispatch(view.state.tr.insertText('brave ', 7));
    const [item] = listSuggestions(view.state.doc);
    expect(item.kind).to.equal('insert');
    expect(item.inserted).to.equal('brave ');
  });

  it('returns nothing for a clean document', () => {
    view = editorWith('Hello world');
    expect(listSuggestions(view.state.doc)).to.deep.equal([]);
  });
});

describe('suggestions reach the panel over the bus', () => {
  let view;
  afterEach(() => view?.destroy());

  it('publishes suggestions as they are made', () => {
    let latest = null;
    const off = canvasBus.suggestionsState.subscribe((d) => { latest = d; });
    view = editorWith('Hello cruel world');
    setSuggesting(view, true);
    view.dispatch(view.state.tr.delete(7, 13));
    off();
    expect(latest.items).to.have.lengthOf(1);
    expect(latest.items[0].kind).to.equal('delete');
  });

  // The panel only emits a request; ew-editor-doc owns applying it to the view.
  it('accepts from the panel and clears the list', async () => {
    view = editorWith('Hello cruel world');
    setSuggesting(view, true);
    view.dispatch(view.state.tr.delete(7, 13));

    const el = document.createElement('ew-editor-doc');
    document.body.append(el);
    await el.updateComplete;
    el._proseContext = { view };
    el._canWrite = true;
    el._editorView = 'content';

    let latest = null;
    const off = canvasBus.suggestionsState.subscribe((d) => { latest = d; });
    const [item] = listSuggestions(view.state.doc);
    canvasBus.suggestionResolveRequest.emit({ from: item.from, to: item.to, action: 'accept' });
    off();
    el.remove();

    expect(view.state.doc.textContent).to.equal('Hello world');
    expect(latest.items).to.deep.equal([]);
  });

  it('rejects from the panel and restores the text', async () => {
    view = editorWith('Hello cruel world');
    setSuggesting(view, true);
    view.dispatch(view.state.tr.delete(7, 13));

    const el = document.createElement('ew-editor-doc');
    document.body.append(el);
    await el.updateComplete;
    el._proseContext = { view };
    el._canWrite = true;
    el._editorView = 'content';

    const [item] = listSuggestions(view.state.doc);
    canvasBus.suggestionResolveRequest.emit({ from: item.from, to: item.to, action: 'reject' });
    el.remove();

    expect(view.state.doc.textContent).to.equal('Hello cruel world');
    expect(listSuggestions(view.state.doc)).to.deep.equal([]);
  });
});

describe('resolving records an outcome', () => {
  let view;
  let el;

  const mount = async (text) => {
    view = editorWith(text);
    el = document.createElement('ew-editor-doc');
    document.body.append(el);
    await el.updateComplete;
    el._proseContext = { view };
    el._canWrite = true;
    el._editorView = 'content';
    return el;
  };

  const withRecorder = () => {
    const calls = [];
    el._comments = {
      teardown() {},
      controller: {
        getCurrentUser: () => ({ id: 'u1', name: 'Usman Khalid' }),
        recordSuggestionOutcome: (args) => { calls.push(args); },
      },
    };
    return calls;
  };

  afterEach(() => {
    view?.destroy();
    el?.remove();
    view = null;
    el = null;
  });

  it('records what was accepted, and by whom', async () => {
    await mount('Hello cruel world');
    setSuggesting(view, true);
    view.dispatch(view.state.tr.delete(7, 13));
    const calls = withRecorder();

    const [item] = listSuggestions(view.state.doc);
    canvasBus.suggestionResolveRequest.emit({ from: item.from, to: item.to, action: 'accept' });

    expect(calls).to.have.lengthOf(1);
    expect(calls[0].action).to.equal('accept');
    expect(calls[0].suggestion.deleted).to.equal('cruel ');
    expect(calls[0].user.name).to.equal('Usman Khalid');
  });

  it('records a rejection too', async () => {
    await mount('Hello cruel world');
    setSuggesting(view, true);
    view.dispatch(view.state.tr.delete(7, 13));
    const calls = withRecorder();

    const [item] = listSuggestions(view.state.doc);
    canvasBus.suggestionResolveRequest.emit({ from: item.from, to: item.to, action: 'reject' });

    expect(calls[0].action).to.equal('reject');
  });

  it('still applies the change when no recorder is available', async () => {
    await mount('Hello cruel world');
    setSuggesting(view, true);
    view.dispatch(view.state.tr.delete(7, 13));
    el._comments = { teardown() {} };

    const [item] = listSuggestions(view.state.doc);
    canvasBus.suggestionResolveRequest.emit({ from: item.from, to: item.to, action: 'accept' });

    expect(view.state.doc.textContent).to.equal('Hello world');
  });
});
