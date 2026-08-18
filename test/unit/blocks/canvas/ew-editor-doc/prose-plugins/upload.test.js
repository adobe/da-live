import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getSourceUploadContext;
let uploadImageFile;
let MAX_IMAGE_BYTES;
let toasts;

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

before(async () => {
  ({ getSourceUploadContext } = await import('../../../../../../blocks/canvas/ew-editor-doc/prose-plugins/sourceUploadContext.js'));
  ({ uploadImageFile } = await import('../../../../../../blocks/canvas/ew-editor-doc/prose-plugins/imageDrop.js'));
  ({ MAX_IMAGE_BYTES } = await import('../../../../../../blocks/canvas/utils/image-upload.js'));
  ({ toasts } = await import('../../../../../fixtures/nx2/blocks/shared/toast/toast.js'));
});

// isHlx6 memoizes its answer per site, so each case needs its own org/site
function stubStore({ upgraded, contentUrl = 'https://content.da.live/org/site/.doc/pic.png' }) {
  const saved = window.fetch;
  const calls = [];
  window.fetch = async (url, opts) => {
    const href = typeof url === 'string' ? url : url.url;
    calls.push({ url: href, opts });
    if (href.includes('/ping/')) {
      return new Response('', {
        status: 200,
        headers: upgraded ? { 'x-api-upgrade-available': 'true' } : {},
      });
    }
    return new Response(JSON.stringify({ source: { contentUrl } }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { calls, restore: () => { window.fetch = saved; } };
}

afterEach(() => {
  window.localStorage.removeItem('hlx6-upgrade');
});

describe('getSourceUploadContext', () => {
  it('reads a da-admin source url', () => {
    const ctx = getSourceUploadContext('https://admin.da.live/source/org/site/dir/doc.html');
    expect(ctx).to.deep.equal({ parent: '/org/site/dir', name: 'doc' });
  });

  it('reads a source-bus source url', () => {
    const ctx = getSourceUploadContext('https://api.aem.live/org/sites/site/source/dir/doc.html');
    expect(ctx).to.deep.equal({ parent: '/org/site/dir', name: 'doc' });
  });

  it('reads a document at the site root', () => {
    expect(getSourceUploadContext('https://admin.da.live/source/org/site/index.html'))
      .to.deep.equal({ parent: '/org/site', name: 'index' });
    expect(getSourceUploadContext('https://api.aem.live/org/sites/site/source/index.html'))
      .to.deep.equal({ parent: '/org/site', name: 'index' });
  });

  it('answers null for a url it cannot read', () => {
    expect(getSourceUploadContext('')).to.equal(null);
    expect(getSourceUploadContext('https://admin.da.live/list/org/site')).to.equal(null);
    expect(getSourceUploadContext(null)).to.equal(null);
  });
});

describe('uploadImageFile', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor();
    await nextFrame();
  });

  afterEach(() => {
    destroyEditor(editor);
  });

  const png = () => new File([new Uint8Array([1, 2, 3])], 'pic.png', { type: 'image/png' });

  it('uploads to the source bus for a migrated site', async () => {
    const { calls, restore } = stubStore({ upgraded: true, contentUrl: './media_abc.png' });
    try {
      await uploadImageFile(editor.view, png(), { parent: '/upsorg/upssite/dir', name: 'doc' });

      // nx2 owns the route past the site, so this pins only the store and the path
      const upload = calls.find((c) => c.opts?.method === 'POST');
      expect(upload, 'nothing was uploaded').to.exist;
      expect(new URL(upload.url).origin).to.equal('https://api.aem.live');
      expect(upload.url).to.contain('/upsorg/sites/upssite/');
      expect(upload.url.endsWith('/dir/.doc/pic.png'), upload.url).to.equal(true);
    } finally {
      restore();
    }
  });

  it('uploads to da-admin for a legacy site', async () => {
    const { calls, restore } = stubStore({ upgraded: false });
    try {
      await uploadImageFile(editor.view, png(), { parent: '/legorg/legsite/dir', name: 'doc' });

      const upload = calls.find((c) => c.opts?.method === 'POST');
      expect(upload, 'nothing was uploaded').to.exist;
      expect(new URL(upload.url).origin).to.equal('https://admin.da.live');
      expect(upload.url.endsWith('/legorg/legsite/dir/.doc/pic.png'), upload.url).to.equal(true);
    } finally {
      restore();
    }
  });

  it('shows a media bus image without waiting for it to load', async () => {
    // a relative src cannot load from the canvas origin
    const { restore } = stubStore({ upgraded: true, contentUrl: './media_abc.png' });
    try {
      await uploadImageFile(editor.view, png(), { parent: '/relorg/relsite', name: 'doc' });
      await nextFrame();

      let stored;
      editor.view.state.doc.descendants((node) => {
        if (node.type.name === 'image') stored = node.attrs.src;
      });
      expect(stored).to.equal('./media_abc.png');
    } finally {
      restore();
    }
  });

  it('refuses a file type the store does not take', async () => {
    const { calls, restore } = stubStore({ upgraded: false });
    try {
      const pdf = new File([new Uint8Array([1])], 'doc.pdf', { type: 'application/pdf' });
      await uploadImageFile(editor.view, pdf, { parent: '/pdforg/pdfsite', name: 'doc' });

      expect(calls.filter((c) => c.opts?.method === 'POST')).to.have.length(0);
    } finally {
      restore();
    }
  });

  it('refuses an image over the upload limit', async () => {
    const { calls, restore } = stubStore({ upgraded: true });
    toasts.length = 0;
    try {
      const big = new File(
        [new Uint8Array(MAX_IMAGE_BYTES + 1)],
        'big.png',
        { type: 'image/png' },
      );
      await uploadImageFile(editor.view, big, { parent: '/bigorg/bigsite', name: 'doc' });
      await nextFrame();

      expect(calls.filter((c) => c.opts?.method === 'POST')).to.have.length(0);
      let images = 0;
      editor.view.state.doc.descendants((node) => {
        if (node.type.name === 'image') images += 1;
      });
      expect(images, 'the fpo was left in the document').to.equal(0);
      expect(toasts).to.have.length(1);
      expect(toasts[0].text).to.contain('Image upload failed');
      expect(toasts[0].text).to.contain('4.5 MB or under');
    } finally {
      restore();
    }
  });
});
