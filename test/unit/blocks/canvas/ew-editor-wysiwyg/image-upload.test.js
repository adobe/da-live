import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let handleImageReplace;
let MAX_IMAGE_BYTES;
let toasts;

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

before(async () => {
  ({ handleImageReplace } = await import('../../../../../blocks/canvas/ew-editor-wysiwyg/utils/image.js'));
  ({ MAX_IMAGE_BYTES } = await import('../../../../../blocks/canvas/utils/image-upload.js'));
  ({ toasts } = await import('../../../../fixtures/nx2/blocks/shared/toast/toast.js'));
});

function stubStore({ upgraded, contentUrl = './media_abc.png' }) {
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

describe('handleImageReplace', () => {
  let editor;

  const ctxFor = (owner, repo) => {
    const posted = [];
    return {
      posted,
      ctx: {
        owner,
        repo,
        path: '/page',
        view: editor.view,
        port: { postMessage: (message) => posted.push(message) },
        getToken: () => 'test-token',
      },
    };
  };

  const imageData = 'data:image/png;base64,iVBORw0KGgo=';

  beforeEach(async () => {
    editor = await createTestEditor();
    await nextFrame();
  });

  afterEach(() => {
    destroyEditor(editor);
  });

  it('uploads to the source bus for a migrated site', async () => {
    const { calls, restore } = stubStore({ upgraded: true });
    const { ctx } = ctxFor('wysorg', 'wyssite');
    try {
      await handleImageReplace({ imageData, fileName: 'pic.png', originalSrc: '/old.png' }, ctx);

      // the route past the site is nx2's, so what is pinned is the store and the path
      const upload = calls.find((c) => c.opts?.method === 'POST');
      expect(upload, 'nothing was uploaded').to.exist;
      expect(new URL(upload.url).origin).to.equal('https://api.aem.live');
      expect(upload.url).to.contain('/wysorg/sites/wyssite/');
      expect(upload.url.endsWith('/.page/pic.png'), upload.url).to.equal(true);
    } finally {
      restore();
    }
  });

  it('uploads to da-admin for a legacy site', async () => {
    const { calls, restore } = stubStore({ upgraded: false, contentUrl: 'https://content.da.live/wyslegacy/wyslegacy/.page/pic.png' });
    const { ctx } = ctxFor('wyslegacy', 'wyslegacy');
    try {
      await handleImageReplace({ imageData, fileName: 'pic.png', originalSrc: '/old.png' }, ctx);

      const upload = calls.find((c) => c.opts?.method === 'POST');
      expect(upload, 'nothing was uploaded').to.exist;
      expect(new URL(upload.url).origin).to.equal('https://admin.da.live');
      expect(upload.url.endsWith('/wyslegacy/wyslegacy/.page/pic.png'), upload.url).to.equal(true);
    } finally {
      restore();
    }
  });

  it('reports the src the store gave back, not one it composed', async () => {
    const { restore } = stubStore({ upgraded: true, contentUrl: './media_xyz.png' });
    const { ctx, posted } = ctxFor('wysrep', 'wysrep');
    try {
      await handleImageReplace({ imageData, fileName: 'pic.png', originalSrc: '/old.png' }, ctx);

      expect(posted.at(-1).payload.newSrc).to.equal('./media_xyz.png');
    } finally {
      restore();
    }
  });

  it('reports a refused upload', async () => {
    const saved = window.fetch;
    window.fetch = async (url) => {
      if (String(url).includes('/ping/')) return new Response('', { status: 200 });
      return new Response('', { status: 403 });
    };
    const { ctx, posted } = ctxFor('wysref', 'wysref');
    try {
      await handleImageReplace({ imageData, fileName: 'pic.png', originalSrc: '/old.png' }, ctx);

      expect(posted.at(-1).payload.error).to.contain('403');
    } finally {
      window.fetch = saved;
    }
  });

  it('refuses an image over the upload limit', async () => {
    const { calls, restore } = stubStore({ upgraded: true });
    const { ctx, posted } = ctxFor('wysbig', 'wysbig');
    // base64 inflates by 4/3, so this decodes to one byte over the limit
    const big = `data:image/png;base64,${'A'.repeat(Math.ceil((MAX_IMAGE_BYTES + 1) / 3) * 4)}`;
    toasts.length = 0;
    try {
      await handleImageReplace({ imageData: big, fileName: 'big.png', originalSrc: '/old.png' }, ctx);

      expect(calls.filter((c) => c.opts?.method === 'POST')).to.have.length(0);
      expect(posted.at(-1).payload.error).to.contain('too large');
      expect(toasts).to.have.length(1);
      expect(toasts[0].text).to.contain('4.5 MB or under');
    } finally {
      restore();
    }
  });
});
