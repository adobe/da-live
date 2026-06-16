import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const imageDropFactory = (await import(
  '../../../../../blocks/canvas/ew-editor-doc/prose-plugins/imageDrop.js'
)).default;

const SOURCE_URL = 'https://admin.da.live/source/org/repo/path/page.html';

let testSchema;

before(async () => {
  const { getSchema } = await import('da-parser');
  testSchema = getSchema();
});

function makePlugin() {
  return imageDropFactory(testSchema, () => SOURCE_URL);
}

const tick = (ms = 20) => new Promise((r) => { setTimeout(r, ms); });

function paragraphWithImage(view, attrs) {
  const { schema } = view.state;
  const img = schema.nodes.image.create(attrs);
  const para = schema.nodes.paragraph.create(null, img);
  view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, para));
}

describe('canvas imageDrop · replace-in-place', () => {
  let editor;
  let savedFetch;

  beforeEach(async () => {
    editor = await createTestEditor({ additionalPlugins: [makePlugin()] });
    savedFetch = window.fetch;
  });

  afterEach(() => {
    destroyEditor(editor);
    window.fetch = savedFetch;
  });

  it('preserves alt/title when a drop lands on an existing image', async () => {
    paragraphWithImage(editor.view, {
      src: '/old.png',
      alt: 'Original alt',
      title: 'Original title',
    });

    let uploadCalled = false;
    window.fetch = () => {
      uploadCalled = true;
      return Promise.resolve(new Response(
        JSON.stringify({ source: { contentUrl: 'https://content.da.live/new.png' } }),
        { status: 200 },
      ));
    };

    // Fake `posAtCoords` returning the image's position (pos 1 inside the paragraph).
    editor.view.posAtCoords = () => ({ pos: 1, inside: 0 });

    const file = new File(['x'], 'replacement.png', { type: 'image/png' });
    const plugin = makePlugin();
    const { drop } = plugin.props.handleDOMEvents;

    let prevented = false;
    await drop(editor.view, {
      preventDefault: () => { prevented = true; },
      clientX: 10,
      clientY: 10,
      dataTransfer: { files: [file] },
    });
    expect(prevented).to.equal(true);

    // Wait for the upload promise + .json() + dispatch to settle.
    await tick();

    expect(uploadCalled).to.equal(true);
    const node = editor.view.state.doc.nodeAt(1);
    expect(node.attrs.src).to.equal('https://content.da.live/new.png');
    expect(node.attrs.alt).to.equal('Original alt');
    expect(node.attrs.title).to.equal('Original title');
  });

  it('derives alt from filename when the existing image had no alt', async () => {
    paragraphWithImage(editor.view, { src: '/old.png' });

    window.fetch = () => Promise.resolve(new Response(
      JSON.stringify({ source: { contentUrl: 'https://content.da.live/new.png' } }),
      { status: 200 },
    ));

    editor.view.posAtCoords = () => ({ pos: 1, inside: 0 });

    const file = new File(['x'], 'mountain-view.png', { type: 'image/png' });
    const plugin = makePlugin();
    await plugin.props.handleDOMEvents.drop(editor.view, {
      preventDefault: () => {},
      clientX: 10,
      clientY: 10,
      dataTransfer: { files: [file] },
    });
    await tick();

    const node = editor.view.state.doc.nodeAt(1);
    expect(node.attrs.alt).to.equal('Mountain view');
  });

  it('falls through to the insert path when the drop is not on an image', async () => {
    paragraphWithImage(editor.view, { src: '/keep.png', alt: 'Keep me' });

    window.fetch = () => Promise.resolve(new Response(
      JSON.stringify({ source: { contentUrl: 'https://content.da.live/inserted.png' } }),
      { status: 200 },
    ));

    // Drop is not on any image position.
    editor.view.posAtCoords = () => null;

    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const plugin = makePlugin();
    await plugin.props.handleDOMEvents.drop(editor.view, {
      preventDefault: () => {},
      clientX: 10,
      clientY: 10,
      dataTransfer: { files: [file] },
    });
    await tick();

    // The original image's src should still be present (untouched).
    let foundOld = false;
    editor.view.state.doc.descendants((node) => {
      if (node.type.name === 'image' && node.attrs.src === '/keep.png') foundOld = true;
    });
    expect(foundOld).to.equal(true);
  });
});
