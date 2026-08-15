import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getSourceUploadContext;
let uploadImageFile;

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

before(async () => {
  ({ getSourceUploadContext } = await import('../../../../../../blocks/canvas/ew-editor-doc/prose-plugins/sourceUploadContext.js'));
  ({ uploadImageFile } = await import('../../../../../../blocks/canvas/ew-editor-doc/prose-plugins/imageDrop.js'));
});

// isHlx6 pings admin.hlx.page, and the upload goes to whichever store that names. Each case needs
// its own org/site because the answer is memoized per site.
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

      // nx2 owns the route it builds from the path, so what is pinned here is the store it went
      // to and the path the canvas handed it
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
    // a relative src cannot load from the canvas origin, so waiting on it would leave the
    // placeholder in the document for good
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
});
