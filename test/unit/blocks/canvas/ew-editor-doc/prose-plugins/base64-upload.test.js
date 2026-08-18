import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let base64Uploader;
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
  ({ default: base64Uploader } = await import('../../../../../../blocks/canvas/ew-editor-doc/prose-plugins/base64Uploader.js'));
  ({ MAX_IMAGE_BYTES } = await import('../../../../../../blocks/canvas/utils/image-upload.js'));
  ({ toasts } = await import('../../../../../fixtures/nx2/blocks/shared/toast/toast.js'));
});

function stubStore() {
  const saved = window.fetch;
  const calls = [];
  window.fetch = async (url, opts) => {
    const href = typeof url === 'string' ? url : url.url;
    calls.push({ url: href, opts });
    if (href.includes('/ping/')) {
      return new Response('', { status: 200, headers: { 'x-api-upgrade-available': 'true' } });
    }
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

  const pluginFor = (sourceUrl) => base64Uploader({
    getSourceUrl: () => sourceUrl,
    getEditorView: () => editor.view,
  });

  beforeEach(async () => {
    editor = await createTestEditor();
    await nextFrame();
    toasts.length = 0;
  });

  afterEach(() => {
    destroyEditor(editor);
  });

  it('drops a pasted image over the upload limit', async () => {
    const { calls, restore } = stubStore();
    try {
      // base64 inflates by 4/3, so this decodes to just over the limit
      const src = `data:image/png;base64,${'A'.repeat(Math.ceil((MAX_IMAGE_BYTES + 1) / 3) * 4)}`;
      const plugin = pluginFor('https://api.aem.live/pasteorg/sites/pastesite/source/doc.html');
      const html = plugin.props.transformPastedHTML(`<p><img src="${src}"></p>`);
      await until(() => toasts.length);

      expect(html).to.not.contain('data:image');
      expect(html).to.not.contain('<img');
      expect(calls.filter((c) => c.opts?.method === 'POST')).to.have.length(0);
      expect(toasts).to.have.length(1);
      expect(toasts[0].text).to.contain('Image upload failed');
      expect(toasts[0].text).to.contain('4.5 MB or under');
    } finally {
      restore();
    }
  });

  it('uploads a pasted image inside the limit', async () => {
    const { calls, restore } = stubStore();
    try {
      const src = 'data:image/png;base64,iVBORw0KGgo=';
      const plugin = pluginFor('https://api.aem.live/pasteok/sites/pasteok/source/doc.html');
      const html = plugin.props.transformPastedHTML(`<p><img src="${src}"></p>`);
      await until(() => calls.some((c) => c.opts?.method === 'POST'));

      expect(html).to.contain('/blocks/edit/img/fpo.svg');
      expect(calls.filter((c) => c.opts?.method === 'POST')).to.have.length(1);
      expect(toasts).to.have.length(0);
    } finally {
      restore();
    }
  });
});
