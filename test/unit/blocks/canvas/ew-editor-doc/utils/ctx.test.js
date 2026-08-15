import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let sourceUrlFromEditorCtx;
let editorDocCanLoad;

before(async () => {
  ({ sourceUrlFromEditorCtx, editorDocCanLoad } = await import('../../../../../../blocks/canvas/ew-editor-doc/utils/ctx.js'));
});

function stubPing({ upgraded }) {
  const saved = window.fetch;
  window.fetch = async () => new Response('', {
    status: 200,
    headers: upgraded ? { 'x-api-upgrade-available': 'true' } : {},
  });
  return () => { window.fetch = saved; };
}

afterEach(() => {
  window.localStorage.removeItem('hlx6-upgrade');
});

describe('sourceUrlFromEditorCtx', () => {
  it('routes a source-bus document to api.aem.live', async () => {
    const restore = stubPing({ upgraded: true });
    try {
      const url = await sourceUrlFromEditorCtx({ org: 'ctxorg', repo: 'ctxsite', path: '/ctxorg/ctxsite/page' });
      expect(url).to.equal('https://api.aem.live/ctxorg/sites/ctxsite/source/page.html');
    } finally {
      restore();
    }
  });

  it('answers null for a ctx with no path', async () => {
    expect(await sourceUrlFromEditorCtx({ org: 'o', repo: 's' })).to.equal(null);
    expect(await sourceUrlFromEditorCtx(null)).to.equal(null);
  });
});

describe('editorDocCanLoad', () => {
  it('is decided without a network call', () => {
    // a promise is truthy, so this has to stay synchronous or an empty path reads as loadable
    expect(editorDocCanLoad({ org: 'o', repo: 's', path: '/o/s/page' })).to.equal(true);
  });

  it('refuses a ctx with an empty path', () => {
    expect(editorDocCanLoad({ org: 'o', repo: 's', path: '' })).to.equal(false);
    expect(editorDocCanLoad({ org: 'o', repo: 's', path: '   ' })).to.equal(false);
  });

  it('refuses a ctx missing org or site', () => {
    expect(editorDocCanLoad({ repo: 's', path: '/o/s/page' })).to.equal(false);
    expect(editorDocCanLoad({ org: 'o', path: '/o/s/page' })).to.equal(false);
    expect(editorDocCanLoad(null)).to.equal(false);
  });
});
