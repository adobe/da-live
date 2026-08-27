import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let base64Uploader;
let uploadBase64Image;
let MAX_IMAGE_BYTES;
let toasts;

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

// the paste handler is synchronous and leaves the upload running behind it
async function until(done, tries = 50) {
  for (let i = 0; i < tries; i += 1) {
    if (done()) return;
    // eslint-disable-next-line no-await-in-loop
    await nextFrame();
  }
}

before(async () => {
  ({ default: base64Uploader, uploadBase64Image } = await import('../../../../../../blocks/canvas/ew-editor-doc/prose-plugins/base64Uploader.js'));
  ({ MAX_IMAGE_BYTES } = await import('../../../../../../blocks/canvas/utils/image-upload.js'));
  ({ toasts } = await import('../../../../../fixtures/nx2/blocks/shared/toast/toast.js'));
});

// isHlx6 memoizes its answer per site, so each case needs its own org/site
function stubStore({ upgraded }) {
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
    if (href.startsWith('data:')) return new Response(new Blob([new Uint8Array([1])]));
    return new Response(JSON.stringify({ source: { contentUrl: './media_abc.png' } }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { calls, restore: () => { window.fetch = saved; } };
}

afterEach(() => {
  window.localStorage.removeItem('hlx6-upgrade');
});

describe('base64Uploader', () => {
  let editor;

  const oversized = () => `data:image/png;base64,${'A'.repeat(Math.ceil((MAX_IMAGE_BYTES + 1) / 3) * 4)}`;

  const insertFpo = (fpoSrc) => {
    const { schema } = editor.view.state;
    const fpo = schema.nodes.image.create({ src: fpoSrc });
    editor.view.dispatch(editor.view.state.tr.replaceSelectionWith(fpo));
  };

  const imageSrcs = () => {
    const srcs = [];
    editor.view.state.doc.descendants((node) => {
      if (node.type.name === 'image') srcs.push(node.attrs.src);
    });
    return srcs;
  };

  beforeEach(async () => {
    editor = await createTestEditor();
    await nextFrame();
    toasts.length = 0;
  });

  afterEach(() => {
    destroyEditor(editor);
  });

  it('swaps a pasted data url for the fpo and uploads it', async () => {
    const { calls, restore } = stubStore({ upgraded: true });
    try {
      const plugin = base64Uploader({
        getSourceUrl: () => 'https://api.aem.live/pasteok/sites/pasteok/source/doc.html',
        getEditorView: () => editor.view,
      });
      const html = plugin.props.transformPastedHTML('<p><img src="data:image/png;base64,iVBORw0KGgo="></p>');
      await until(() => calls.some((c) => c.opts?.method === 'POST'));

      expect(html).to.contain('/blocks/edit/img/fpo.svg');
      expect(calls.filter((c) => c.opts?.method === 'POST')).to.have.length(1);
      expect(toasts).to.have.length(0);
    } finally {
      restore();
    }
  });

  it('drops the fpo when the pasted image is over the upload limit', async () => {
    const { calls, restore } = stubStore({ upgraded: true });
    const fpoSrc = '/blocks/edit/img/fpo.svg#1';
    try {
      insertFpo(fpoSrc);
      expect(imageSrcs()).to.deep.equal([fpoSrc]);

      await uploadBase64Image(editor.view, {
        src: oversized(),
        path: '/pastebig/pastebig/.doc/wp1.png',
        fpoSrc,
        parent: '/pastebig/pastebig',
      });

      expect(calls.filter((c) => c.opts?.method === 'POST')).to.have.length(0);
      expect(imageSrcs(), 'the fpo was left in the document').to.deep.equal([]);
      expect(toasts).to.have.length(1);
      expect(toasts[0].text).to.contain('Image upload failed');
      expect(toasts[0].text).to.contain('4.5 MB or under');
    } finally {
      restore();
    }
  });

  it('takes an oversized image on a legacy site, where the limit does not apply', async () => {
    const { calls, restore } = stubStore({ upgraded: false });
    const fpoSrc = '/blocks/edit/img/fpo.svg#2';
    try {
      insertFpo(fpoSrc);
      await uploadBase64Image(editor.view, {
        src: oversized(),
        path: '/pasteleg/pasteleg/.doc/wp2.png',
        fpoSrc,
        parent: '/pasteleg/pasteleg',
      });

      expect(calls.filter((c) => c.opts?.method === 'POST')).to.have.length(1);
      expect(toasts).to.have.length(0);
    } finally {
      restore();
    }
  });
});
