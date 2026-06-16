import { expect } from '@esm-bundle/chai';
import { NodeSelection, TextSelection } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const {
  getSelectedImage,
  updateImageAttrs,
  altFromFilename,
  uploadImageToDa,
  SUPPORTED_IMAGE_TYPES,
} = await import('../../../../../blocks/canvas/editor-utils/image-ops.js');

function paragraphWithImage(view, attrs) {
  const { schema } = view.state;
  const img = schema.nodes.image.create(attrs);
  const para = schema.nodes.paragraph.create(null, img);
  const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, para);
  view.dispatch(tr);
}

function selectImage(view) {
  // Image is at position 1 (inside the paragraph at position 0).
  const tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, 1));
  view.dispatch(tr);
}

describe('image-ops · pure helpers', () => {
  it('SUPPORTED_IMAGE_TYPES covers common web image MIME types', () => {
    expect(SUPPORTED_IMAGE_TYPES).to.include.members([
      'image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp', 'image/avif',
    ]);
  });

  it('altFromFilename handles common shapes', () => {
    expect(altFromFilename('my-cool-photo.png')).to.equal('My cool photo');
    expect(altFromFilename('hero_image.JPG')).to.equal('Hero image');
    expect(altFromFilename('no-extension')).to.equal('No extension');
    expect(altFromFilename('')).to.equal('');
    expect(altFromFilename(undefined)).to.equal('');
  });
});

describe('image-ops · getSelectedImage / updateImageAttrs', () => {
  let editor;

  beforeEach(async () => { editor = await createTestEditor(); });
  afterEach(() => destroyEditor(editor));

  it('returns null when no image is selected', () => {
    expect(getSelectedImage(editor.view.state)).to.equal(null);
  });

  it('returns {node, pos} when an image NodeSelection is active', () => {
    paragraphWithImage(editor.view, { src: '/a.png', alt: 'A' });
    selectImage(editor.view);
    const sel = getSelectedImage(editor.view.state);
    expect(sel).to.not.equal(null);
    expect(sel.node.type.name).to.equal('image');
    expect(sel.node.attrs.src).to.equal('/a.png');
    expect(sel.pos).to.equal(1);
  });

  it('returns null for a text selection even if cursor is next to an image', () => {
    paragraphWithImage(editor.view, { src: '/a.png' });
    const tr = editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, 0));
    editor.view.dispatch(tr);
    expect(getSelectedImage(editor.view.state)).to.equal(null);
  });

  it('updateImageAttrs swaps src while preserving other attrs', () => {
    paragraphWithImage(editor.view, {
      src: '/old.png',
      alt: 'Caption',
      title: 'Hover text',
    });
    selectImage(editor.view);
    const ok = updateImageAttrs(editor.view, 1, { src: '/new.png' });
    expect(ok).to.equal(true);
    const node = editor.view.state.doc.nodeAt(1);
    expect(node.attrs.src).to.equal('/new.png');
    expect(node.attrs.alt).to.equal('Caption');
    expect(node.attrs.title).to.equal('Hover text');
  });

  it('updateImageAttrs returns false when pos is not an image', () => {
    paragraphWithImage(editor.view, { src: '/a.png' });
    const ok = updateImageAttrs(editor.view, 0, { src: '/b.png' });
    expect(ok).to.equal(false);
  });
});

describe('image-ops · uploadImageToDa', () => {
  let savedFetch;

  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  function mockResp(body, status = 200) {
    window.fetch = () => Promise.resolve(new Response(JSON.stringify(body), { status }));
  }

  const validSource = 'https://admin.da.live/source/org/repo/path/doc.html';

  it('no-ops on unsupported MIME types', async () => {
    const file = new File(['x'], 'evil.exe', { type: 'application/x-msdownload' });
    const result = await uploadImageToDa({ file, sourceUrl: validSource });
    expect(result).to.equal(null);
  });

  it('no-ops when sourceUrl is not a DA source URL', async () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const result = await uploadImageToDa({ file, sourceUrl: 'not-a-url' });
    expect(result).to.equal(null);
  });

  it('returns {src} on successful upload', async () => {
    mockResp({ source: { contentUrl: 'https://content.da.live/x.png' } });
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const result = await uploadImageToDa({ file, sourceUrl: validSource });
    expect(result).to.deep.equal({ src: 'https://content.da.live/x.png' });
  });

  it('returns null when the upload fails', async () => {
    mockResp({}, 500);
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const result = await uploadImageToDa({ file, sourceUrl: validSource });
    expect(result).to.equal(null);
  });

  it('encodes the filename so path traversal characters are defanged', async () => {
    let calledUrl = '';
    window.fetch = (url) => {
      calledUrl = String(url);
      return Promise.resolve(new Response(
        JSON.stringify({ source: { contentUrl: '/x.png' } }),
        { status: 200 },
      ));
    };
    const file = new File(['x'], '../etc/passwd.png', { type: 'image/png' });
    await uploadImageToDa({ file, sourceUrl: validSource });
    expect(calledUrl).to.not.include('../');
    expect(calledUrl).to.include('..%2Fetc%2Fpasswd.png');
  });
});
