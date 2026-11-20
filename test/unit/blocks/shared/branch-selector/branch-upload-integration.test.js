import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let canvasUpload;
let legacyUpload;
let dropUpload;
let canvasPaste;
let legacyPaste;
before(async () => {
  ({ uploadImageFile: canvasUpload } = await import('../../../../../blocks/canvas/ew-editor-doc/prose-plugins/imageDrop.js'));
  ({ uploadImageFile: legacyUpload } = await import('../../../../../blocks/edit/prose/plugins/imageDrop.js'));
  ({ uploadFile: dropUpload } = await import('../../../../../blocks/canvas/drop/content.js'));
  ({ uploadBase64Image: canvasPaste } = await import('../../../../../blocks/canvas/ew-editor-doc/prose-plugins/base64Uploader.js'));
  ({ uploadBase64Image: legacyPaste } = await import('../../../../../blocks/edit/prose/plugins/base64uploader.js'));
  await import('../../../../../blocks/browse/da-new/da-new.js');
});

describe('branch media upload callers', () => {
  let editor;
  let originalUrl;
  let originalFetch;
  let calls;
  const parent = '/mediaorg/mediasite~work/dir';

  beforeEach(async () => {
    originalUrl = window.location.href;
    originalFetch = window.fetch;
    history.replaceState(null, '', '/edit#/mediaorg/mediasite~work/dir/page');
    calls = [];
    window.fetch = async (input, options = {}) => {
      const url = String(input);
      calls.push({ url, options });
      if (url.startsWith('data:')) {
        return new Response(new Blob(['image'], { type: 'image/png' }));
      }
      if (url.endsWith('/capabilities')) {
        return new Response(JSON.stringify({
          supported: true,
          apiVersion: 1,
          defaultBranchId: 'main',
          addressing: 'site-suffix',
          separator: '~',
          operations: ['create', 'changes', 'sync', 'publish', 'revert', 'restore'],
          itemKinds: ['html', 'json', 'media', 'config'],
          branchScopedSource: true,
          branchScopedCollaboration: true,
        }), { status: 200 });
      }
      if (url.endsWith('/branches/mediaorg/mediasite/work')) {
        return new Response('{"id":"work"}', { status: 200 });
      }
      if (options.method === 'POST' && url.startsWith('https://admin.da.live/source/')) {
        const sourceUrl = new URL(url).pathname;
        const filename = sourceUrl.split('/').pop();
        const response = { source: { sourceUrl, contentUrl: `./${filename}` } };
        const headers = { 'Content-Branch': 'work' };
        return new Response(JSON.stringify(response), { status: 201, headers });
      }
      throw new Error(`Unexpected request: ${url}`);
    };
    editor = await createTestEditor();
  });

  afterEach(() => {
    destroyEditor(editor);
    window.fetch = originalFetch;
    history.replaceState(null, '', originalUrl);
  });

  function storedImage() {
    let src;
    editor.view.state.doc.descendants((node) => {
      if (node.type.name === 'image') src = node.attrs.src;
    });
    return src;
  }

  function assertBranchUpload() {
    const upload = calls.find(({ options }) => options.method === 'POST');
    expect(upload.url).to.match(/^https:\/\/admin\.da\.live\/source\/mediaorg\/mediasite~work\/dir\/media_[a-f0-9]{32}\.png$/);
    expect(upload.options.headers['If-None-Match']).to.equal('*');
    return `./${upload.url.split('/').pop()}`;
  }

  it('canvas image drop stores the returned relative Source reference', async () => {
    const file = new File(['image'], 'photo #1.png', { type: 'image/png' });
    await canvasUpload(editor.view, file, { parent, name: 'page' });
    expect(storedImage()).to.equal(assertBranchUpload());
  });

  it('legacy image drop stores the returned relative Source reference', async () => {
    const file = new File(['image'], 'photo #1.png', { type: 'image/png' });
    await legacyUpload(editor.view, file);
    expect(storedImage()).to.equal(assertBranchUpload());
  });

  it('canvas drop pipeline returns the same relative reference', async () => {
    const file = new File(['image'], 'photo #1.png', { type: 'image/png' });
    const result = await dropUpload({ file, context: { parent, name: 'page' } });
    expect(result.src).to.equal(assertBranchUpload());
  });

  it('generic media upload keeps its requested branch Source path', async () => {
    history.replaceState(null, '', '/#/mediaorg/mediasite~work/assets');
    const create = document.createElement('da-new');
    create.fullpath = '/mediaorg/mediasite~work/assets';
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    const picker = { files: [file], value: 'photo.png' };
    const event = { target: picker };
    const pending = create.handleAddFile(event);
    event.target = null;
    await pending;
    const upload = calls.find(({ options }) => options.method === 'POST');
    expect(upload.url).to.equal('https://admin.da.live/source/mediaorg/mediasite~work/assets/photo.png');
    expect(upload.options.body.get('data').type).to.equal('image/png');
    expect(picker.value).to.equal('');
  });

  it('does not announce generic media uploads rejected by branch validation', async () => {
    history.replaceState(null, '', '/#/mediaorg/mediasite~work/assets');
    const original = window.fetch;
    window.fetch = (url, options) => (options?.method === 'POST'
      ? Promise.resolve(new Response('{}', { status: 201, headers: { 'Content-Branch': 'main' } }))
      : original(url, options));
    const create = document.createElement('da-new');
    create.fullpath = '/mediaorg/mediasite~work/assets';
    let announced = false;
    create.addEventListener('newitem', () => { announced = true; });
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    const picker = { files: [file], value: 'photo.png' };
    const event = { target: picker };
    const pending = create.handleAddFile(event);
    event.target = null;
    await pending;
    expect(create._mediaError).to.include('Could not upload branch media');
    expect(announced).to.equal(false);
    expect(picker.value).to.equal('');
  });

  ['canvas', 'legacy'].forEach((label) => {
    it(`${label} pasted images store a relative reference`, async () => {
      const fpoSrc = '/fpo.png';
      const image = editor.view.state.schema.nodes.image.create({ src: fpoSrc });
      editor.view.dispatch(editor.view.state.tr.replaceSelectionWith(image));
      const fn = label === 'canvas' ? canvasPaste : legacyPaste;
      const options = { src: 'data:image/png;base64,eA==', path: `${parent}/.page/wp.png`, fpoSrc, parent };
      await fn(editor.view, options);
      expect(storedImage()).to.equal(assertBranchUpload());
    });
  });
});
