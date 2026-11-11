import { expect } from '@esm-bundle/chai';
import { Y } from 'da-y-wrapper';
import { getNx2, setNx } from '../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let handleImageReplace;
let performDrop;
let fromAssets;
let getImageDocumentVersion;
let HLX6_MAX_IMAGE_BYTES;
let toasts;
let setRepositoryConfig;
let setSelection;
let resetSelections;

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

before(async () => {
  ({ getImageDocumentVersion } = await import(`${getNx2()}/public/utils/quick-edit-images.js`));
  ({ handleImageReplace } = await import('../../../../../blocks/canvas/ew-editor-wysiwyg/utils/image.js'));
  ({ performDrop } = await import('../../../../../blocks/canvas/drop/pipeline.js'));
  ({ fromAssets } = await import('../../../../../blocks/canvas/drop/payload.js'));
  ({ HLX6_MAX_IMAGE_BYTES } = await import('../../../../../blocks/canvas/utils/image-upload.js'));
  ({ toasts } = await import('../../../../fixtures/nx2/blocks/shared/toast/toast.js'));
  ({ setRepositoryConfig } = await import(`${getNx2()}/utils/aem-assets/repository-config.js`));
  ({ setSelection, resetSelections } = await import(`${getNx2()}/utils/aem-assets/selection.js`));
});

function stubStore({ upgraded, contentUrl = './media_abc.png', onUpload } = {}) {
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
    await onUpload?.();
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
  let imagePos;

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
  const request = (overrides = {}) => ({
    imageData,
    fileName: 'pic.png',
    proseIndex: imagePos,
    requestId: 'upload-1',
    imageVersion: getImageDocumentVersion(editor.view.state.doc),
    originalSrc: '/old.png',
    ...overrides,
  });

  beforeEach(async () => {
    editor = await createTestEditor();
    const { state } = editor.view;
    const img = state.schema.nodes.image.create({ src: '/old.png', alt: 'Original alt' });
    const para = state.schema.nodes.paragraph.create(null, img);
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, para));
    editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') imagePos = pos;
    });
    await nextFrame();
  });

  afterEach(() => {
    setRepositoryConfig(null);
    resetSelections();
    destroyEditor(editor);
  });

  it('refuses an Assets request, which the rail now resolves through the host drop session', async () => {
    const { ctx, posted } = ctxFor('assetorg', 'assetsite');
    const { calls, restore } = stubStore();
    try {
      await handleImageReplace(request({ imageData: undefined, assets: [{ id: 'asset' }] }), ctx);
      expect(calls).to.have.length(0);
      expect(posted.at(-1).payload).to.include({ requestId: 'upload-1' });
      expect(posted.at(-1).payload.error).to.be.a('string');
      expect(editor.view.state.doc.nodeAt(imagePos).attrs.src).to.equal('/old.png');
    } finally { restore(); }
  });

  describe('Assets dropped on a preview image', () => {
    const dropAssets = ({ isLive } = {}) => performDrop({
      payload: fromAssets([{ id: 'asset' }]),
      target: { editor: 'wysiwyg', type: 'image', ...request() },
      view: editor.view,
      context: { org: 'assetorg', site: 'assetsite' },
      isLive,
    });

    it('resolves an Assets image using the site config without uploading a thumbnail', async () => {
      setRepositoryConfig({ tierType: 'author' });
      setSelection({ href: 'https://assets.example.com/image.png', isImage: true });
      const { calls, restore } = stubStore();
      try {
        const result = await dropAssets();
        expect(calls).to.have.length(0);
        expect(editor.view.state.doc.nodeAt(imagePos).attrs)
          .to.include({ src: 'https://assets.example.com/image.png', alt: 'Original alt' });
        expect(result).to.include({ ok: true, src: 'https://assets.example.com/image.png' });
      } finally { restore(); }
    });

    describe('link-images', () => {
      const SRC = 'https://assets.example.com/image.png';
      const setLinkImage = () => {
        const { state } = editor.view;
        editor.view.dispatch(state.tr.setNodeMarkup(
          imagePos,
          null,
          { ...state.doc.nodeAt(imagePos).attrs, editAs: 'image' },
        ));
      };

      it('keeps editAs when an Assets image replaces a link-image on an editable-link site', async () => {
        setLinkImage();
        setRepositoryConfig({ tierType: 'author', imageType: 'editable-link' });
        setSelection({ href: SRC, isImage: true });
        const result = await dropAssets();
        expect(result.ok).to.equal(true);
        expect(editor.view.state.doc.nodeAt(imagePos).attrs)
          .to.include({ src: SRC, editAs: 'image' });
      });

      it('sets editAs when an Assets image replaces a regular image on an editable-link site', async () => {
        setRepositoryConfig({ tierType: 'author', imageType: 'editable-link' });
        setSelection({ href: SRC, isImage: true });
        await dropAssets();
        expect(editor.view.state.doc.nodeAt(imagePos).attrs.editAs).to.equal('image');
      });

      it('clears editAs when an Assets image replaces a link-image on a default site', async () => {
        setLinkImage();
        setRepositoryConfig({ tierType: 'author', imageType: null });
        setSelection({ href: SRC, isImage: true });
        await dropAssets();
        expect(editor.view.state.doc.nodeAt(imagePos).attrs)
          .to.include({ src: SRC, editAs: null });
      });

      it('clears editAs when an upload replaces a link-image', async () => {
        setLinkImage();
        const { restore } = stubStore();
        try {
          await handleImageReplace(request(), ctxFor('wysorg', 'wyssite').ctx);
          expect(editor.view.state.doc.nodeAt(imagePos).attrs.editAs).to.equal(null);
        } finally { restore(); }
      });

      it('refuses an Assets image on a plain link site', async () => {
        setRepositoryConfig({ tierType: 'author', imageType: 'link' });
        setSelection({ href: SRC, isImage: true });
        expect((await dropAssets()).message).to.contain('single image');
      });
    });

    describe('insert into the document', () => {
      const SRC = 'https://assets.example.com/image.png';
      const dropInto = async (imageType) => {
        setRepositoryConfig({ tierType: 'author', imageType });
        setSelection({ href: SRC, isImage: true, alt: 'Alt' });
        const result = await performDrop({
          payload: fromAssets([{ id: 'asset' }]),
          target: { editor: 'doc', pos: 1 },
          view: editor.view,
          context: { org: 'assetorg', site: 'assetsite' },
        });
        expect(result.ok).to.equal(true);
        const found = [];
        editor.view.state.doc.descendants((node) => {
          if (node.type.name === 'image' && node.attrs.src === SRC) found.push(node);
          if (node.isText && node.marks.some((m) => m.type.name === 'link')) found.push(node);
        });
        return found;
      };

      it('creates a plain image by default', async () => {
        const [node] = await dropInto(null);
        expect(node.type.name).to.equal('image');
        expect(node.attrs.editAs).to.equal(null);
      });

      it('creates a link for a plain link site', async () => {
        const [node] = await dropInto('link');
        expect(node.isText).to.equal(true);
        expect(node.text).to.equal(SRC);
      });

      it('creates a link-image for an editable-link site', async () => {
        const [node] = await dropInto('editable-link');
        expect(node.type.name).to.equal('image');
        expect(node.attrs).to.include({ editAs: 'image', alt: 'Alt' });
      });
    });

    it('reports unconfigured, rejected and non-image Assets without replacing the target', async () => {
      expect((await dropAssets()).message).to.contain('not configured');
      setRepositoryConfig({ tierType: 'author' });
      setSelection({ error: 'Asset not approved' });
      expect((await dropAssets()).message).to.equal('Asset not approved');
      setSelection({ href: 'https://assets.example.com/file.pdf', isImage: false });
      expect((await dropAssets()).message).to.contain('single image');
      expect(editor.view.state.doc.nodeAt(imagePos).attrs.src).to.equal('/old.png');
    });

    it('does not replace a removed image or mutate after permissions change while resolving Assets', async () => {
      setRepositoryConfig({ tierType: 'author' });
      setSelection({ href: 'https://assets.example.com/image.png', isImage: true });
      let canWrite = true;
      const denied = dropAssets({ isLive: () => canWrite });
      canWrite = false;
      expect((await denied).message).to.contain('changed');
      expect(editor.view.state.doc.nodeAt(imagePos).attrs.src).to.equal('/old.png');
      const removed = dropAssets();
      editor.view.dispatch(editor.view.state.tr.delete(imagePos, imagePos + 1));
      expect((await removed).message).to.contain('no longer available');
    });
  });

  it('uploads to the source bus for a migrated site', async () => {
    const { calls, restore } = stubStore({ upgraded: true });
    const { ctx } = ctxFor('wysorg', 'wyssite');
    try {
      await handleImageReplace(request(), ctx);

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
      await handleImageReplace(request(), ctx);

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
      await handleImageReplace(request(), ctx);

      expect(posted.at(-1).payload.newSrc).to.equal('./media_xyz.png');
      expect(posted.at(-1).payload.requestId).to.equal('upload-1');
      expect(editor.view.state.doc.nodeAt(imagePos).attrs.alt).to.equal('Original alt');
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
      await handleImageReplace(request(), ctx);

      expect(posted.at(-1).payload.error).to.contain('403');
    } finally {
      window.fetch = saved;
    }
  });

  it('refuses an image over the upload limit', async () => {
    const { calls, restore } = stubStore({ upgraded: true });
    const { ctx, posted } = ctxFor('wysbig', 'wysbig');
    // base64 inflates by 4/3, so this decodes to one byte over the limit
    const big = `data:image/png;base64,${'A'.repeat(Math.ceil((HLX6_MAX_IMAGE_BYTES + 1) / 3) * 4)}`;
    toasts.length = 0;
    try {
      await handleImageReplace(request({ imageData: big, fileName: 'big.png' }), ctx);

      expect(calls.filter((c) => c.opts?.method === 'POST')).to.have.length(0);
      expect(posted.at(-1).payload.error).to.contain('too large');
      expect(toasts).to.have.length(1);
      expect(toasts[0].text).to.contain('Max image size allowed is 4.5 MB');
    } finally {
      restore();
    }
  });

  it('replaces only the indexed image when two images have the same URL', async () => {
    const { state } = editor.view;
    const first = state.schema.nodes.image.create({ src: '/old.png', alt: 'First' });
    const second = state.schema.nodes.image.create({ src: '/old.png', alt: 'Second' });
    const para = state.schema.nodes.paragraph.create(null, [first, second]);
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, para));
    const positions = [];
    editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') positions.push(pos);
    });
    const { restore } = stubStore({ upgraded: true });
    const { ctx, posted } = ctxFor('wysrep', 'wysrep');
    try {
      await handleImageReplace(request({ proseIndex: positions[1] }), ctx);

      expect(editor.view.state.doc.nodeAt(positions[0]).attrs.src).to.equal('/old.png');
      expect(editor.view.state.doc.nodeAt(positions[1]).attrs.src).to.equal('./media_abc.png');
      expect(editor.view.state.doc.nodeAt(positions[1]).attrs.alt).to.equal('Second');
      expect(posted.at(-1).payload).to.include({ proseIndex: positions[1], requestId: 'upload-1' });
    } finally {
      restore();
    }
  });

  it('rejects an invalid index before uploading rather than using the URL', async () => {
    const { calls, restore } = stubStore({ upgraded: true });
    const { ctx, posted } = ctxFor('wysrep', 'wysrep');
    try {
      await handleImageReplace(request({ proseIndex: imagePos + 1 }), ctx);

      expect(calls.filter((c) => c.opts?.method === 'POST')).to.have.length(0);
      expect(editor.view.state.doc.nodeAt(imagePos).attrs.src).to.equal('/old.png');
      expect(posted.at(-1).payload.error).to.contain('position');
    } finally {
      restore();
    }
  });

  it('rejects a missing index in a new request', async () => {
    const { calls, restore } = stubStore({ upgraded: true });
    const { ctx, posted } = ctxFor('wysrep', 'wysrep');
    try {
      await handleImageReplace(request({ proseIndex: null }), ctx);

      expect(calls.filter((c) => c.opts?.method === 'POST')).to.have.length(0);
      expect(posted.at(-1).payload.error).to.contain('position');
    } finally {
      restore();
    }
  });

  it('rejects an indexed request with no document version', async () => {
    const { calls, restore } = stubStore({ upgraded: true });
    const { ctx, posted } = ctxFor('wysrep', 'wysrep');
    try {
      await handleImageReplace(request({ requestId: null, imageVersion: null }), ctx);

      expect(calls.filter((c) => c.opts?.method === 'POST')).to.have.length(0);
      expect(posted.at(-1).payload.error).to.contain('out of date');
    } finally {
      restore();
    }
  });

  it('rejects a stale image version even if its index now holds an identical image', async () => {
    const staleVersion = getImageDocumentVersion(editor.view.state.doc);
    const { state } = editor.view;
    editor.view.dispatch(state.tr.insert(imagePos, state.schema.nodes.image.create({ src: '/old.png' })));
    const { calls, restore } = stubStore({ upgraded: true });
    const { ctx, posted } = ctxFor('wysrep', 'wysrep');
    try {
      await handleImageReplace(request({ imageVersion: staleVersion }), ctx);

      expect(calls.filter((c) => c.opts?.method === 'POST')).to.have.length(0);
      expect(posted.at(-1).payload.error).to.contain('out of date');
      expect(editor.view.state.doc.nodeAt(imagePos).attrs.src).to.equal('/old.png');
    } finally {
      restore();
    }
  });

  it('rejects an old URL-only request when multiple images match', async () => {
    const { state } = editor.view;
    const duplicate = state.schema.nodes.image.create({ src: '/old.png' });
    editor.view.dispatch(state.tr.insert(imagePos + 1, duplicate));
    const { calls, restore } = stubStore({ upgraded: true });
    const { ctx, posted } = ctxFor('wysrep', 'wysrep');
    try {
      await handleImageReplace({ imageData, fileName: 'pic.png', originalSrc: '/old.png' }, ctx);

      expect(calls.filter((c) => c.opts?.method === 'POST')).to.have.length(0);
      expect(posted.at(-1).payload.error).to.contain('ambiguous');
    } finally {
      restore();
    }
  });

  it('follows the target past an unrelated edit during upload', async () => {
    const { restore } = stubStore({
      upgraded: true,
      onUpload: () => editor.view.dispatch(editor.view.state.tr.insertText('before ', imagePos)),
    });
    const { ctx, posted } = ctxFor('wysrep', 'wysrep');
    try {
      await handleImageReplace(request(), ctx);

      expect(posted.at(-1).payload.newSrc).to.equal('./media_abc.png');
      expect(editor.view.state.doc.nodeAt(imagePos + 'before '.length).attrs)
        .to.include({ src: './media_abc.png', alt: 'Original alt' });
    } finally {
      restore();
    }
  });

  it('follows the target when a collaborator edits before it during upload', async () => {
    expect(editor.ydoc.getXmlFragment('prosemirror').length).to.be.greaterThan(0);
    const originalImage = editor.view.state.doc.nodeAt(imagePos);
    const peerDoc = new Y.Doc();
    Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(editor.ydoc));
    const peer = await createTestEditor({ ydoc: peerDoc, doc: editor.view.state.doc });
    await nextFrame();
    expect(peer.view.state.doc.nodeAt(imagePos)?.type.name).to.equal('image');
    const { restore } = stubStore({
      upgraded: true,
      onUpload: async () => {
        const before = Y.encodeStateVector(editor.ydoc);
        peer.view.dispatch(peer.view.state.tr.insertText('remote ', imagePos));
        Y.applyUpdate(editor.ydoc, Y.encodeStateAsUpdate(peer.ydoc, before));
        await nextFrame();
        const images = [];
        editor.view.state.doc.descendants((node, pos) => {
          if (node.type.name === 'image') images.push(pos);
        });
        expect(images).to.deep.equal([imagePos + 'remote '.length]);
        expect(editor.view.state.doc.nodeAt(images[0])).to.equal(originalImage);
      },
    });
    const { ctx, posted } = ctxFor('wysrep', 'wysrep');
    try {
      await handleImageReplace(request(), ctx);

      expect(posted.at(-1).payload.newSrc).to.equal('./media_abc.png');
      expect(editor.view.state.doc.nodeAt(imagePos + 'remote '.length).attrs.src)
        .to.equal('./media_abc.png');
    } finally {
      restore();
      destroyEditor(peer);
    }
  });

  it('does not replace a new image with the same URL when the target is removed', async () => {
    const { restore } = stubStore({
      upgraded: true,
      onUpload: () => {
        const { state } = editor.view;
        const duplicate = state.schema.nodes.image.create({ src: '/old.png', alt: 'Other image' });
        editor.view.dispatch(state.tr.delete(imagePos, imagePos + 1).insert(imagePos, duplicate));
      },
    });
    const { ctx, posted } = ctxFor('wysrep', 'wysrep');
    try {
      await handleImageReplace(request(), ctx);

      expect(posted.at(-1).payload.error).to.contain('no longer available');
      expect(editor.view.state.doc.nodeAt(imagePos).attrs)
        .to.include({ src: '/old.png', alt: 'Other image' });
    } finally {
      restore();
    }
  });

  it('refuses an image node reused in two positions', async () => {
    const { state } = editor.view;
    editor.view.dispatch(state.tr.insert(imagePos + 1, state.doc.nodeAt(imagePos)));
    const { restore } = stubStore({ upgraded: true });
    const { ctx, posted } = ctxFor('wysrep', 'wysrep');
    try {
      await handleImageReplace(request(), ctx);

      expect(posted.at(-1).payload.error).to.contain('no longer available');
      expect(editor.view.state.doc.nodeAt(imagePos).attrs.src).to.equal('/old.png');
      expect(editor.view.state.doc.nodeAt(imagePos + 1).attrs.src).to.equal('/old.png');
    } finally {
      restore();
    }
  });

  it('keeps simultaneous uploads on distinct images independent', async () => {
    const { state } = editor.view;
    const other = state.schema.nodes.image.create({ src: '/other.png', alt: 'Other' });
    editor.view.dispatch(state.tr.insert(imagePos + 1, other));
    const pending = [];
    let bothUploadsStarted;
    const started = new Promise((resolve) => { bothUploadsStarted = resolve; });
    const { restore } = stubStore({
      upgraded: true,
      onUpload: () => new Promise((resolve) => {
        pending.push(resolve);
        if (pending.length === 2) bothUploadsStarted();
      }),
    });
    const { ctx, posted } = ctxFor('wysrep', 'wysrep');
    const first = handleImageReplace(request({ requestId: 'first' }), ctx);
    const second = handleImageReplace(request({
      proseIndex: imagePos + 1,
      originalSrc: '/other.png',
      requestId: 'second',
    }), ctx);
    try {
      await started;
      pending[0]();
      await first;
      pending[1]();
      await second;

      expect(posted.map(({ payload }) => payload.requestId)).to.deep.equal(['first', 'second']);
      expect(posted.every(({ payload }) => !!payload.newSrc)).to.equal(true);
      expect(editor.view.state.doc.nodeAt(imagePos).attrs.src).to.equal('./media_abc.png');
      expect(editor.view.state.doc.nodeAt(imagePos + 1).attrs.src).to.equal('./media_abc.png');
    } finally {
      pending.forEach((resolve) => resolve());
      restore();
    }
  });
});
