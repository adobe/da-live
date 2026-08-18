import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let editorDocCanLoad;

before(async () => {
  ({ editorDocCanLoad } = await import('../../../../../../blocks/canvas/ew-editor-doc/utils/ctx.js'));
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
