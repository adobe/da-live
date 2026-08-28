import { expect } from '@esm-bundle/chai';
import mediaBusImage, { getRenderableSrc } from '../../../../../../blocks/edit/prose/plugins/mediaBusImage.js';
import { createTestEditor, destroyEditor } from '../test-helpers.js';

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('mediaBusImage plugin', () => {
  let editor;

  beforeEach(async () => {
    window.history.replaceState(null, '', '/edit#/org/repo/page');
    editor = await createTestEditor({ additionalPlugins: [mediaBusImage()] });
    window.view = editor.view;
    await nextFrame();
  });

  afterEach(() => {
    destroyEditor(editor);
    delete window.view;
    window.history.replaceState(null, '', '/');
  });

  describe('getRenderableSrc', () => {
    it('rewrites a relative media src to the preview origin', () => {
      expect(getRenderableSrc('./media_123.png')).to.equal(
        'https://main--repo--org.preview.da.live/media_123.png',
      );
    });

    it('returns null for a non-media src', () => {
      expect(getRenderableSrc('https://example.com/foo.png')).to.be.null;
    });

    it('returns null when there is no src', () => {
      expect(getRenderableSrc(null)).to.be.null;
    });
  });

  it('rewrites the rendered img src without changing the stored doc attrs', async () => {
    const { schema } = editor.view.state;
    const image = schema.nodes.image.create({ src: './media_123.png' });
    const tr = editor.view.state.tr.replaceSelectionWith(image);
    editor.view.dispatch(tr);
    await nextFrame();

    const img = editor.view.dom.querySelector('img');
    expect(img.src).to.equal('https://main--repo--org.preview.da.live/media_123.png');

    let storedSrc;
    editor.view.state.doc.descendants((node) => {
      if (node.type.name === 'image') storedSrc = node.attrs.src;
    });
    expect(storedSrc).to.equal('./media_123.png');
  });

  it('leaves non-media image srcs untouched', async () => {
    const { schema } = editor.view.state;
    const image = schema.nodes.image.create({ src: 'https://example.com/pic.png' });
    const tr = editor.view.state.tr.replaceSelectionWith(image);
    editor.view.dispatch(tr);
    await nextFrame();

    const img = editor.view.dom.querySelector('img');
    expect(img.src).to.equal('https://example.com/pic.png');
  });
});
