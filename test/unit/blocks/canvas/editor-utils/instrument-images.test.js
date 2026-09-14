import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createTestEditor, destroyEditor } = await import('../../edit/prose/test-helpers.js');
const { getInstrumentedHTML } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js');

function insertImages(editor) {
  const { state } = editor.view;
  const { schema } = state;
  const standalone = schema.nodes.paragraph.create(
    null,
    schema.nodes.image.create({ src: '/standalone.png' }),
  );
  const inline = schema.nodes.paragraph.create(
    null,
    [schema.text('hello '), schema.nodes.image.create({ src: '/inline.png' })],
  );
  editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, [standalone, inline]));

  const froms = [];
  editor.view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'image') froms.push(pos);
  });
  return froms;
}

describe('getInstrumentedHTML image instrumentation', () => {
  let editor;
  beforeEach(async () => { editor = await createTestEditor(); });
  afterEach(() => destroyEditor(editor));

  it('stamps every content image with a data-image-index that resolves to the image node', () => {
    const imageFroms = insertImages(editor);
    expect(imageFroms.length).to.equal(2);

    const html = getInstrumentedHTML(editor.view);
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const stamped = [...parsed.querySelectorAll('img[data-image-index]')];

    expect(stamped.length).to.equal(2);

    const { doc } = editor.view.state;
    stamped.forEach((img) => {
      const idx = Number(img.getAttribute('data-image-index'));
      expect(Number.isNaN(idx)).to.equal(false);
      const node = doc.nodeAt(idx);
      expect(node, `nodeAt(${idx}) should be an image`).to.not.equal(null);
      expect(node.type.name).to.equal('image');
      expect(imageFroms).to.include(idx);
    });
  });
});
