import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createTestEditor, destroyEditor } = await import('../../edit/prose/test-helpers.js');
const { getInstrumentedHTML, getInstrumentedHTMLForSDK } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js');

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
  afterEach(() => {
    sinon.restore();
    destroyEditor(editor);
  });

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
    const parsed = new DOMParser().parseFromString(getInstrumentedHTMLForSDK(editor.view), 'text/html');
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

  ['non-image node', 'missing node', 'out-of-range position'].forEach((target) => {
    it(`warns and continues SDK serialization for an image mapped to a ${target}`, () => {
      const positions = insertImages(editor);
      const { view } = editor;
      const before = view.state.doc;
      const firstImage = view.dom.querySelector('img');
      const invalidPosition = {
        'non-image node': 0,
        'missing node': before.content.size,
        'out-of-range position': before.content.size + 1,
      }[target];
      const posAtDOM = view.posAtDOM.bind(view);
      sinon.stub(view, 'posAtDOM').callsFake((element, ...args) => (
        element === firstImage ? invalidPosition : posAtDOM(element, ...args)
      ));
      const warn = sinon.stub(console, 'warn');
      const preview = new DOMParser().parseFromString(getInstrumentedHTML(view), 'text/html');
      const parsed = new DOMParser().parseFromString(getInstrumentedHTMLForSDK(view), 'text/html');
      const images = [...parsed.querySelectorAll('img[data-image-index]')];
      expect(warn.calledOnce).to.equal(true);
      expect(warn.firstCall.args[0]).to.equal('Could not preserve original image URL:');
      expect(warn.firstCall.args[1]).to.be.instanceOf(Error);
      expect(images).to.have.lengthOf(2);
      expect(images[0].closest('picture').outerHTML)
        .to.equal(preview.querySelector('img').closest('picture').outerHTML);
      expect(images[1].getAttribute('src')).to.equal(before.nodeAt(positions[1]).attrs.src);
      expect([...images[1].closest('picture').querySelectorAll('source')]
        .map((source) => source.getAttribute('srcset'))).to.deep.equal(['/inline.png', '/inline.png']);
      expect(view.state.doc).to.equal(before);
    });
  });

  it('strips remote cursor metadata for the SDK without changing preview serialization', () => {
    insertImages(editor);
    const before = editor.view.state.doc;
    const baseline = getInstrumentedHTMLForSDK(editor.view);
    const [first, second] = editor.view.dom.querySelectorAll('p');
    first.setAttribute('data-cursor-remote', 'Collaborator');
    second.setAttribute('data-cursor-remote-color', 'red');
    const preview = getInstrumentedHTML(editor.view);
    expect(preview).to.include('data-cursor-remote="Collaborator"');
    expect(preview).to.include('data-cursor-remote-color="red"');
    expect(getInstrumentedHTMLForSDK(editor.view)).to.equal(baseline);
    expect(getInstrumentedHTML(editor.view)).to.equal(preview);
    expect(first.getAttribute('data-cursor-remote')).to.equal('Collaborator');
    expect(second.getAttribute('data-cursor-remote-color')).to.equal('red');
    expect(editor.view.state.doc).to.equal(before);
  });
});
