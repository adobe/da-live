import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let handleImageReplace;

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

before(async () => {
  ({ handleImageReplace } = await import('../../../../../blocks/canvas/ew-editor-wysiwyg/utils/image.js'));
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

      const upload = calls.find((c) => c.opts?.method === 'POST');
      expect(upload, 'nothing was uploaded').to.exist;
      expect(upload.url).to.equal('https://api.aem.live/wysorg/sites/wyssite/source/.page/pic.png');
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
      expect(upload.url).to.equal('https://admin.da.live/source/wyslegacy/wyslegacy/.page/pic.png');
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
});
