import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import mediaBusImage, { getRenderableSrc } from '../../../../../../blocks/edit/prose/plugins/mediaBusImage.js';
import { createTestEditor, destroyEditor } from '../test-helpers.js';

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('mediaBusImage plugin', () => {
  let editor;

  beforeEach(async () => {
    window.history.replaceState(null, '', '/edit#/org/repo/page');
    editor = await createTestEditor({ additionalPlugins: [mediaBusImage()] });
    window.view = editor.view;
    await nextFrame();
  });

  afterEach(() => {
    destroyEditor(editor);
    delete window.view;
    window.history.replaceState(null, '', '/');
  });

  describe('getRenderableSrc', () => {
    it('rewrites a relative media src to the preview origin', () => {
      expect(getRenderableSrc('./media_123.png')).to.equal(
        'https://main--repo--org.preview.da.live/media_123.png',
      );
    });

    it('returns null for a non-media src', () => {
      expect(getRenderableSrc('https://example.com/foo.png')).to.be.null;
    });

    it('returns null when there is no src', () => {
      expect(getRenderableSrc(null)).to.be.null;
    });
  });

  it('rewrites the rendered img src without changing the stored doc attrs', async () => {
    const { schema } = editor.view.state;
    const image = schema.nodes.image.create({ src: './media_123.png' });
    const tr = editor.view.state.tr.replaceSelectionWith(image);
    editor.view.dispatch(tr);
    await nextFrame();

    const img = editor.view.dom.querySelector('img');
    expect(img.src).to.equal('https://main--repo--org.preview.da.live/media_123.png');

    let storedSrc;
    editor.view.state.doc.descendants((node) => {
      if (node.type.name === 'image') storedSrc = node.attrs.src;
    });
    expect(storedSrc).to.equal('./media_123.png');
  });

  it('leaves non-media image srcs untouched', async () => {
    const { schema } = editor.view.state;
    const image = schema.nodes.image.create({ src: 'https://example.com/pic.png' });
    const tr = editor.view.state.tr.replaceSelectionWith(image);
    editor.view.dispatch(tr);
    await nextFrame();

    const img = editor.view.dom.querySelector('img');
    expect(img.src).to.equal('https://example.com/pic.png');
  });
});

describe('legacy branch media rendering', () => {
  let editor;
  let originalUrl;
  let originalFetch;
  let originalIms;
  let originalNxIms;
  let revoke;
  const calls = [];

  beforeEach(async () => {
    originalUrl = window.location.href;
    originalFetch = window.fetch;
    originalIms = window.adobeIMS;
    originalNxIms = window.localStorage.getItem('nx-ims');
    history.replaceState(null, '', '/edit#/org/repo~work/dir/page');
    window.localStorage.setItem('nx-ims', 'true');
    window.adobeIMS = { getAccessToken: () => ({ token: 'branch-token' }) };
    calls.length = 0;
    window.fetch = async (url, opts) => {
      calls.push({ url, opts });
      const headers = { 'Content-Type': 'image/png', 'Content-Branch': 'work' };
      return new Response('png', { status: 200, headers });
    };
    revoke = sinon.spy(URL, 'revokeObjectURL');
    editor = await createTestEditor({ additionalPlugins: [mediaBusImage()] });
  });

  afterEach(() => {
    if (editor) destroyEditor(editor);
    revoke.restore();
    window.fetch = originalFetch;
    if (originalIms === undefined) delete window.adobeIMS; else window.adobeIMS = originalIms;
    if (originalNxIms === null) window.localStorage.removeItem('nx-ims');
    else window.localStorage.setItem('nx-ims', originalNxIms);
    history.replaceState(null, '', originalUrl);
  });

  it('renders authorized branch Source bytes while keeping the stored relative src', async () => {
    const { schema } = editor.view.state;
    editor.view.dispatch(editor.view.state.tr.replaceSelectionWith(
      schema.nodes.image.create({ src: './media_abc.png' }),
    ));
    await nextFrame();
    await nextFrame();
    expect(calls.map(({ url }) => url)).to.deep.equal([
      'https://admin.da.live/source/org/repo~work/dir/media_abc.png',
    ]);
    expect(calls[0].opts.headers.Authorization).to.equal('Bearer branch-token');
    const blobUrl = editor.view.dom.querySelector('img').getAttribute('src');
    expect(blobUrl).to.match(/^blob:/);
    let stored;
    editor.view.state.doc.descendants((node) => {
      if (node.type.name === 'image') stored = node.attrs.src;
    });
    expect(stored).to.equal('./media_abc.png');
    destroyEditor(editor);
    editor = null;
    expect(revoke.calledWith(blobUrl)).to.equal(true);
  });
});
