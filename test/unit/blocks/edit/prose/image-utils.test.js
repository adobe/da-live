import { expect } from '@esm-bundle/chai';
import { rewriteImageSrcForEditor } from '../../../../../blocks/edit/prose/image-utils.js';

describe('rewriteImageSrcForEditor', () => {
  it('rewrites aem.page host to preview.da.live', () => {
    expect(rewriteImageSrcForEditor('https://main--site--org.aem.page/img.jpg'))
      .to.equal('https://main--site--org.preview.da.live/img.jpg');
  });

  it('rewrites aem.live host to preview.da.live', () => {
    expect(rewriteImageSrcForEditor('https://main--site--org.aem.live/img.jpg'))
      .to.equal('https://main--site--org.preview.da.live/img.jpg');
  });

  it('preserves the path and query string when rewriting', () => {
    expect(rewriteImageSrcForEditor('https://main--site--org.aem.page/media_abc.jpg?width=2000&format=webply'))
      .to.equal('https://main--site--org.preview.da.live/media_abc.jpg?width=2000&format=webply');
  });

  it('leaves unrelated URLs unchanged', () => {
    expect(rewriteImageSrcForEditor('https://example.com/img.jpg'))
      .to.equal('https://example.com/img.jpg');
  });

  it('leaves content.da.live URLs unchanged', () => {
    expect(rewriteImageSrcForEditor('https://content.da.live/org/repo/img.jpg'))
      .to.equal('https://content.da.live/org/repo/img.jpg');
  });

  it('leaves relative URLs unchanged', () => {
    expect(rewriteImageSrcForEditor('/img/photo.jpg')).to.equal('/img/photo.jpg');
  });

  it('leaves malformed URLs unchanged', () => {
    expect(rewriteImageSrcForEditor('not a url')).to.equal('not a url');
  });
});
