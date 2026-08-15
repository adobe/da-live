import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getRenderableSrc;
let mediaBusImage;

const ctx = { org: 'org', repo: 'repo', path: '/org/repo/page' };
const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

before(async () => {
  ({ default: mediaBusImage, getRenderableSrc } = await import('../../../../../../blocks/canvas/ew-editor-doc/prose-plugins/mediaBusImage.js'));
});

describe('canvas getRenderableSrc', () => {
  it('rewrites a relative media src to the preview origin', () => {
    expect(getRenderableSrc('./media_123.png', ctx)).to.equal(
      'https://main--repo--org.preview.da.live/media_123.png',
    );
  });

  it('answers null for a src that is not on the media bus', () => {
    expect(getRenderableSrc('https://example.com/foo.png', ctx)).to.equal(null);
    expect(getRenderableSrc('/media_123.png', ctx)).to.equal(null);
    expect(getRenderableSrc(null, ctx)).to.equal(null);
  });

  it('answers null when the ctx names no site', () => {
    expect(getRenderableSrc('./media_123.png', { org: 'org' })).to.equal(null);
    expect(getRenderableSrc('./media_123.png', null)).to.equal(null);
  });
});

describe('canvas mediaBusImage plugin', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor({ additionalPlugins: [mediaBusImage(ctx)] });
    await nextFrame();
  });

  afterEach(() => {
    destroyEditor(editor);
  });

  it('renders a media bus image from the preview origin, and stores the relative src', async () => {
    const { schema } = editor.view.state;
    const image = schema.nodes.image.create({ src: './media_123.png' });
    editor.view.dispatch(editor.view.state.tr.replaceSelectionWith(image));
    await nextFrame();

    const img = editor.view.dom.querySelector('img');
    expect(img.src).to.equal('https://main--repo--org.preview.da.live/media_123.png');

    let storedSrc;
    editor.view.state.doc.descendants((node) => {
      if (node.type.name === 'image') storedSrc = node.attrs.src;
    });
    expect(storedSrc).to.equal('./media_123.png');
  });

  it('leaves an absolute image src alone', async () => {
    const { schema } = editor.view.state;
    const image = schema.nodes.image.create({ src: 'https://example.com/pic.png' });
    editor.view.dispatch(editor.view.state.tr.replaceSelectionWith(image));
    await nextFrame();

    expect(editor.view.dom.querySelector('img').src).to.equal('https://example.com/pic.png');
  });
});
