import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createTestEditor, destroyEditor } = await import('../../edit/prose/test-helpers.js');
const { getInstrumentedHTML, getInstrumentedHTMLPreservingImageUrls } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js');

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
    const versions = new Set(stamped.map((img) => img.getAttribute('data-image-version')));
    expect(versions.size).to.equal(1);
    expect([...versions][0]).to.be.a('string');
    stamped.forEach((img) => {
      const idx = Number(img.getAttribute('data-image-index'));
      expect(Number.isNaN(idx)).to.equal(false);
      const node = doc.nodeAt(idx);
      expect(node, `nodeAt(${idx}) should be an image`).to.not.equal(null);
      expect(node.type.name).to.equal('image');
      expect(imageFroms).to.include(idx);
    });
  });

  it('preserves original image URLs for extensions without changing preview serialization', () => {
    const urls = [
      'https://stage-content.da.live/org/site/.page/image.jpg?width=800&format=webp',
      'https://content.da.live/other/site/media.png',
      'https://images.example.com/external.png',
      './media_abc.png',
    ];
    const { state } = editor.view;
    const { schema } = state;
    const paragraphs = urls.map((src) => schema.nodes.paragraph.create(
      null,
      schema.nodes.image.create({ src }),
    ));
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, paragraphs));
    const before = editor.view.state.doc;
    const previewBefore = getInstrumentedHTML(editor.view);
    const parsed = new DOMParser().parseFromString(getInstrumentedHTMLPreservingImageUrls(editor.view), 'text/html');
    const images = [...parsed.querySelectorAll('img[data-image-index]')];
    expect(images.map((image) => image.getAttribute('src'))).to.deep.equal(urls);
    images.forEach((image, index) => {
      const picture = image.closest('picture');
      expect([...picture.querySelectorAll('source')].map((source) => source.getAttribute('srcset')))
        .to.deep.equal([urls[index], urls[index]]);
      expect(image.getAttribute('data-image-version')).to.be.a('string').and.not.empty;
      const pos = Number(image.getAttribute('data-image-index'));
      expect(before.nodeAt(pos).attrs.src).to.equal(urls[index]);
    });
    const preview = new DOMParser().parseFromString(previewBefore, 'text/html');
    expect(preview.querySelector('img').getAttribute('src'))
      .to.equal('/.page/image.jpg?width=800&format=webp');
    expect(getInstrumentedHTML(editor.view)).to.equal(previewBefore);
    expect(editor.view.state.doc).to.equal(before);
  });
});
