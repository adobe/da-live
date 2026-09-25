import { expect } from '@esm-bundle/chai';
import { EditorState, EditorView, TextSelection } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
import {
  createExtensionsBridgePlugin,
  getExtensionsBridge,
} from '../../../../../blocks/canvas/editor-utils/extensions-bridge.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

function makeBridgedView(json) {
  const schema = getSchema();
  const doc = schema.nodeFromJSON(json);
  const dom = document.createElement('div');
  document.body.appendChild(dom);
  const state = EditorState.create({ schema, doc, plugins: [createExtensionsBridgePlugin()] });
  const view = new EditorView(dom, {
    state,
    dispatchTransaction(tr) { view.updateState(view.state.apply(tr)); },
  });
  return view;
}

describe('createExtensionsBridgePlugin', () => {
  afterEach(() => {
    getExtensionsBridge().view = null;
  });

  it('emits canvasBus.editorDocState whenever a transaction changes the doc', () => {
    const view = makeBridgedView({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] });
    let calls = 0;
    const unsub = canvasBus.editorDocState.subscribe(() => { calls += 1; });

    view.dispatch(view.state.tr.insertText('!', 3));

    unsub();
    expect(calls).to.equal(1);
  });

  it('does not emit for a selection-only transaction', () => {
    const view = makeBridgedView({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] });
    let calls = 0;
    const unsub = canvasBus.editorDocState.subscribe(() => { calls += 1; });

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));

    unsub();
    expect(calls).to.equal(0);
  });
});
