/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { canvasBus } = await import('../../../../../blocks/canvas/utils/canvas-bus.js');
const { MESSAGE_TYPES } = await import('../../../../../blocks/canvas/utils/quick-edit-messages.js');

before(async () => {
  await import('../../../../../blocks/canvas/ew-editor-doc/ew-editor-doc.js');
});

async function createDoc(editor) {
  const el = document.createElement('ew-editor-doc');
  document.body.appendChild(el);
  await el.updateComplete;
  el._proseContext = { view: editor.view };
  const postCalls = [];
  el._controllerCtx = { port: { postMessage: (msg) => postCalls.push(msg), close: () => {} } };
  return { el, postCalls };
}

describe('EwEditorDoc — editorSectionSelectState mirroring', () => {
  let editor;
  let el;
  let postCalls;

  beforeEach(async () => {
    editor = await createTestEditor();
    ({ el, postCalls } = await createDoc(editor));
  });

  afterEach(() => {
    el.remove();
    destroyEditor(editor);
  });

  it('posts SET_SELECTED_NODE with the section node when source is outline', () => {
    canvasBus.editorSectionSelectState.emit({ sectionIndex: 1, source: 'outline' });

    expect(postCalls).to.have.lengthOf(1);
    expect(postCalls[0]).to.deep.include({
      type: MESSAGE_TYPES.SET_SELECTED_NODE,
      node: { anchorType: 'section', sectionIndex: 1 },
      scrollIntoView: true,
    });
  });

  it('echoes a layout selection back without scrolling', () => {
    canvasBus.editorSectionSelectState.emit({ sectionIndex: 1, source: 'layout' });

    expect(postCalls).to.have.lengthOf(1);
    expect(postCalls[0]).to.deep.include({
      type: MESSAGE_TYPES.SET_SELECTED_NODE,
      node: { anchorType: 'section', sectionIndex: 1 },
      scrollIntoView: false,
    });
  });

  it('posts a cleared selection when sectionIndex is null and source is outline', () => {
    canvasBus.editorSectionSelectState.emit({ sectionIndex: null, source: 'outline' });

    expect(postCalls).to.have.lengthOf(1);
    expect(postCalls[0]).to.deep.include({
      node: null,
      scrollIntoView: false,
    });
  });

  it('does not drop a second outline selection of a different section', () => {
    canvasBus.editorSectionSelectState.emit({ sectionIndex: 1, source: 'outline' });
    canvasBus.editorSectionSelectState.emit({ sectionIndex: 2, source: 'outline' });

    expect(postCalls).to.have.lengthOf(2);
    expect(postCalls[1].node).to.deep.equal({ anchorType: 'section', sectionIndex: 2 });
  });
});

describe('EwEditorDoc — outline section select scrolls the doc without moving the PM selection', () => {
  let editor;
  let el;

  beforeEach(async () => {
    editor = await createTestEditor();
    const { schema } = editor.view.state;
    const { paragraph, horizontal_rule: hr } = schema.nodes;
    const tr = editor.view.state.tr.replaceWith(0, editor.view.state.doc.content.size, [
      paragraph.create(null, schema.text('Hello')),
      hr.create(),
      paragraph.create(null, schema.text('World')),
    ]);
    editor.view.dispatch(tr);
    ({ el } = await createDoc(editor));
  });

  afterEach(() => {
    el.remove();
    destroyEditor(editor);
  });

  it('leaves view.state.selection unchanged after an outline section select', () => {
    const selectionBefore = editor.view.state.selection;

    canvasBus.editorSectionSelectState.emit({ sectionIndex: 1, source: 'outline' });

    expect(editor.view.state.selection).to.equal(selectionBefore);
  });

  it('scrolls the section element into view', () => {
    const calls = [];
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoView(...args) {
      calls.push({ el: this, args });
    };

    try {
      canvasBus.editorSectionSelectState.emit({ sectionIndex: 1, source: 'outline' });
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }

    expect(calls).to.have.lengthOf(1);
    expect(editor.view.dom.contains(calls[0].el)).to.equal(true);
  });
});
