/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { EditorState, EditorView } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
import createSuggestionPlugin, { isSuggesting } from '../../../../../blocks/canvas/suggestions/suggestion-plugin.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

before(async () => {
  await import('../../../../../blocks/canvas/ew-editor-doc/ew-editor-doc.js');
});

const schema = getSchema();

describe('suggest mode is scoped to the doc editor', () => {
  let el;
  let view;

  beforeEach(async () => {
    const host = document.createElement('div');
    document.body.append(host);
    view = new EditorView(host, {
      state: EditorState.create({
        doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Hello world')])]),
        plugins: [createSuggestionPlugin({ username: 'ada' })],
      }),
    });
    el = document.createElement('ew-editor-doc');
    document.body.append(el);
    await el.updateComplete;
    el._proseContext = { view };
    el._canWrite = true;
    el._editorView = 'content';
  });

  afterEach(() => {
    view?.destroy();
    el?.remove();
  });

  it('toggles on in content mode', () => {
    canvasBus.suggestModeRequest.emit();
    expect(isSuggesting(view.state)).to.be.true;
  });

  it('refuses to toggle on in layout mode', () => {
    el._editorView = 'layout';
    canvasBus.suggestModeRequest.emit();
    expect(isSuggesting(view.state)).to.be.false;
  });

  it('exits the mode when switching to layout', () => {
    canvasBus.suggestModeRequest.emit();
    expect(isSuggesting(view.state)).to.be.true;

    canvasBus.editorViewState.emit({ view: 'layout' });
    expect(isSuggesting(view.state)).to.be.false;
  });

  it('broadcasts the mode off so the header clears', () => {
    canvasBus.suggestModeRequest.emit();
    let last;
    const off = canvasBus.suggestModeState.subscribe((d) => { last = d; });
    canvasBus.editorViewState.emit({ view: 'layout' });
    off();
    expect(last).to.deep.equal({ on: false });
  });

  it('turns the mode back on when returning from layout', () => {
    canvasBus.suggestModeRequest.emit();
    canvasBus.editorViewState.emit({ view: 'layout' });

    let last;
    const off = canvasBus.suggestModeState.subscribe((d) => { last = d; });
    canvasBus.editorViewState.emit({ view: 'content' });
    off();
    expect(isSuggesting(view.state)).to.be.true;
    expect(last).to.deep.equal({ on: true });
  });

  it('stays off when returning from layout if it was off before', () => {
    canvasBus.editorViewState.emit({ view: 'layout' });
    canvasBus.editorViewState.emit({ view: 'split' });
    expect(isSuggesting(view.state)).to.be.false;
  });
});

describe('revealing a suggestion', () => {
  let el;
  let view;

  beforeEach(async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const added = schema.marks.suggestion_insert.create({ username: 'ada' });
    view = new EditorView(host, {
      state: EditorState.create({
        doc: schema.node('doc', null, [
          schema.node('paragraph', null, [schema.text('Intro')]),
          schema.node('paragraph', null, [schema.text('Hello '), schema.text('new', [added])]),
        ]),
        plugins: [createSuggestionPlugin({ username: 'ada' })],
      }),
    });
    el = document.createElement('ew-editor-doc');
    document.body.append(el);
    await el.updateComplete;
    el._proseContext = { view };
    el._editorView = 'layout';
  });

  afterEach(() => {
    view?.destroy();
    el?.remove();
  });

  it('scrolls layout to the suggestion instead of switching views', () => {
    const posted = [];
    el._controllerCtx = { port: { postMessage: (m) => posted.push(m), close() {} } };
    const requested = [];
    const off = canvasBus.editorViewRequest.subscribe((d) => requested.push(d));
    canvasBus.suggestionRevealRequest.emit({ pos: 14 });
    off();
    expect(requested).to.deep.equal([]);
    expect(posted).to.deep.equal([{ type: 'scroll-to-pos', payload: { proseIndex: 14 } }]);
    expect(view.state.selection.from).to.equal(1);
  });

  it('puts the caret on the suggestion when the doc is visible', () => {
    el._editorView = 'content';
    canvasBus.suggestionRevealRequest.emit({ pos: 14 });
    expect(view.state.selection.from).to.equal(14);
    expect(isSuggesting(view.state)).to.be.false;
  });

  it('ignores a position past the end of the document', () => {
    const requested = [];
    const off = canvasBus.editorViewRequest.subscribe((d) => requested.push(d));
    canvasBus.suggestionRevealRequest.emit({ pos: 999 });
    off();
    expect(requested).to.deep.equal([]);
    expect(view.state.selection.from).to.equal(1);
  });
});
