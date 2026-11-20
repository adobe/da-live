import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx } from '../../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getRenderableSrc;
let mediaBusImage;

const ctx = { org: 'org', repo: 'repo', path: '/org/repo/page' };
const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

before(async () => {
  ({ default: mediaBusImage, getRenderableSrc } = await import('../../../../../../blocks/canvas/ew-editor-doc/prose-plugins/mediaBusImage.js'));
});

describe('canvas branch media rendering', () => {
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
    history.replaceState(null, '', '/canvas#/org/repo~work/dir/page');
    window.localStorage.setItem('nx-ims', 'true');
    window.adobeIMS = { getAccessToken: () => ({ token: 'branch-token' }) };
    calls.length = 0;
    window.fetch = async (url, opts) => {
      calls.push({ url, opts });
      const headers = { 'Content-Type': 'image/png', 'Content-Branch': 'work' };
      return new Response('png', { status: 200, headers });
    };
    revoke = sinon.spy(URL, 'revokeObjectURL');
    const branchCtx = { org: 'org', repo: 'repo~work', path: '/org/repo~work/dir/page' };
    editor = await createTestEditor({ additionalPlugins: [mediaBusImage(branchCtx)] });
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
    expect(calls[0].opts.redirect).to.equal('error');
    const img = editor.view.dom.querySelector('img');
    const blobUrl = img.getAttribute('src');
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

describe('canvas getRenderableSrc', () => {
  // the same origin the canvas fetches its preview cookie from, which is stage off da.live
  it('rewrites a relative media src to the origin the canvas logged into', () => {
    expect(getRenderableSrc('./media_123.png', ctx)).to.equal(
      'https://main--repo--org.stage-preview.da.live/media_123.png',
    );
  });

  it('answers null for a src that is not on the media bus', () => {
    expect(getRenderableSrc('https://example.com/foo.png', ctx)).to.equal(null);
    expect(getRenderableSrc('/media_123.png', ctx)).to.equal(null);
    expect(getRenderableSrc(null, ctx)).to.equal(null);
  });

  it('answers null when the ctx names no site', () => {
    expect(getRenderableSrc('./media_123.png', { org: 'org' })).to.equal(null);
    expect(getRenderableSrc('./media_123.png', null)).to.equal(null);
  });
});

describe('canvas mediaBusImage plugin', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor({ additionalPlugins: [mediaBusImage(ctx)] });
    await nextFrame();
  });

  afterEach(() => {
    destroyEditor(editor);
  });

  it('renders a media bus image from the preview origin, and stores the relative src', async () => {
    const { schema } = editor.view.state;
    const image = schema.nodes.image.create({ src: './media_123.png' });
    editor.view.dispatch(editor.view.state.tr.replaceSelectionWith(image));
    await nextFrame();

    const img = editor.view.dom.querySelector('img');
    expect(img.src).to.equal('https://main--repo--org.stage-preview.da.live/media_123.png');

    let storedSrc;
    editor.view.state.doc.descendants((node) => {
      if (node.type.name === 'image') storedSrc = node.attrs.src;
    });
    expect(storedSrc).to.equal('./media_123.png');
  });

  it('leaves an absolute image src alone', async () => {
    const { schema } = editor.view.state;
    const image = schema.nodes.image.create({ src: 'https://example.com/pic.png' });
    editor.view.dispatch(editor.view.state.tr.replaceSelectionWith(image));
    await nextFrame();

    expect(editor.view.dom.querySelector('img').src).to.equal('https://example.com/pic.png');
  });
});
