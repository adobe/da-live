import { expect } from '@esm-bundle/chai';
import { EditorState, EditorView, TextSelection } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import createSuggestionPlugin, {
  setSuggesting,
  acceptSuggestionsInRange,
  rejectSuggestionsInRange,
} from '../../../../../blocks/canvas/suggestions/suggestion-plugin.js';
import suggestionPopover from '../../../../../blocks/canvas/suggestions/suggestion-popover.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

const schema = getSchema();

describe('suggestion popover', () => {
  let view;
  let container;

  const popover = () => container.querySelector('.ew-suggestion-popover');
  const isOpen = () => popover().classList.contains('open');
  const cursorInside = (word) => {
    const at = view.state.doc.textContent.indexOf(word) + 1 + Math.floor(word.length / 2);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
  };

  // The popover only asks; ew-editor-doc applies. Stand in for it here.
  let offBus;
  const applyRequests = () => {
    offBus = canvasBus.suggestionResolveRequest.subscribe(({ from, to, action }) => {
      const inRange = action === 'reject' ? rejectSuggestionsInRange : acceptSuggestionsInRange;
      inRange(from, to)(view.state, view.dispatch);
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    const host = document.createElement('div');
    container.append(host);
    view = new EditorView(host, {
      state: EditorState.create({
        doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Hello cruel world')])]),
        plugins: [createSuggestionPlugin({ username: 'Ada' }), suggestionPopover()],
      }),
    });
  });

  afterEach(() => {
    offBus?.();
    offBus = null;
    view?.destroy();
    container?.remove();
  });

  it('mounts closed when there are no suggestions', () => {
    expect(popover()).to.exist;
    expect(isOpen()).to.be.false;
  });

  it('opens when the cursor sits in a suggestion', () => {
    setSuggesting(view, true);
    view.dispatch(view.state.tr.delete(7, 12));
    cursorInside('cruel');
    expect(isOpen()).to.be.true;
  });

  it('names the author', () => {
    setSuggesting(view, true);
    view.dispatch(view.state.tr.delete(7, 12));
    cursorInside('cruel');
    expect(popover().querySelector('.ew-suggestion-popover-author').textContent).to.equal('Ada suggested');
  });

  it('accepts from the popover button', () => {
    setSuggesting(view, true);
    view.dispatch(view.state.tr.delete(7, 12));
    cursorInside('cruel');
    applyRequests();
    popover().querySelector('[data-action="accept"]').click();
    expect(view.state.doc.textContent).to.equal('Hello  world');
  });

  it('rejects from the popover button', () => {
    setSuggesting(view, true);
    view.dispatch(view.state.tr.delete(7, 12));
    cursorInside('cruel');
    applyRequests();
    popover().querySelector('[data-action="reject"]').click();
    expect(view.state.doc.textContent).to.equal('Hello cruel world');
  });

  it('closes once the suggestion is resolved', () => {
    setSuggesting(view, true);
    view.dispatch(view.state.tr.delete(7, 12));
    cursorInside('cruel');
    applyRequests();
    popover().querySelector('[data-action="accept"]').click();
    expect(isOpen()).to.be.false;
  });

  it('is removed when the editor is destroyed', () => {
    view.destroy();
    view = null;
    expect(popover()).to.be.null;
  });
});

describe('suggestion popover — request shape', () => {
  let view;
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    const host = document.createElement('div');
    container.append(host);
    view = new EditorView(host, {
      state: EditorState.create({
        doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Hello cruel world')])]),
        plugins: [createSuggestionPlugin({ username: 'Ada' }), suggestionPopover()],
      }),
    });
    setSuggesting(view, true);
    view.dispatch(view.state.tr.delete(7, 13));
    const at = view.state.doc.textContent.indexOf('cruel') + 3;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
  });

  afterEach(() => {
    view?.destroy();
    container?.remove();
  });

  // Both the popover and the panel go through this channel so outcomes get recorded.
  it('asks over the shared channel instead of editing directly', () => {
    let request = null;
    const off = canvasBus.suggestionResolveRequest.subscribe((d) => { request = d; });
    container.querySelector('[data-action="accept"]').click();
    off();
    expect(request.action).to.equal('accept');
    expect(request.from).to.be.a('number');
    expect(view.state.doc.textContent).to.contain('cruel');
  });
});
