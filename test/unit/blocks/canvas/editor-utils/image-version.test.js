import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { updateState, getInstrumentedHTML } = await import(
  '../../../../../blocks/canvas/editor-utils/editor-utils.js'
);

describe('quick-edit image version after an inline edit', () => {
  let editor;

  beforeEach(async () => { editor = await createTestEditor(); });
  afterEach(() => destroyEditor(editor));

  it('acknowledges the same snapshot that the next instrumented body uses', () => {
    const { state } = editor.view;
    const original = state.schema.nodes.paragraph.create(null, state.schema.nodes.image.create({ src: '/old.png' }));
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, original));

    const newNode = editor.view.state.schema.nodes.paragraph.create(null, [
      editor.view.state.schema.text('before '),
      editor.view.state.schema.nodes.image.create({ src: '/old.png' }),
    ]);
    const posted = [];
    const ctx = {
      view: editor.view,
      port: { postMessage: (message) => posted.push(message) },
    };
    updateState({ node: newNode.toJSON(), cursorOffset: 1, nodeUpdateId: 'edit-1' }, ctx);

    const ack = posted.at(-1);
    expect(ack.type).to.equal('node-update');
    expect(ack.payload.nodeUpdateId).to.equal('edit-1');
    const html = new DOMParser().parseFromString(getInstrumentedHTML(editor.view), 'text/html');
    expect(html.querySelector('img').getAttribute('data-image-version'))
      .to.equal(ack.payload.imageVersion);
  });
});
