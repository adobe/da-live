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
});
