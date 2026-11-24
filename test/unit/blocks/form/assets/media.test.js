import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import { describeAsset, splitHrefForDisplay } from '../../../../../blocks/form/assets/media.js';

const previewOrigin = 'https://main--site--example.preview.da.live';

describe('form media values', () => {
  it('previews Media Bus images against the site preview origin, as Canvas does', () => {
    expect(describeAsset({ href: './media_abc.png', previewOrigin }).previewHref)
      .to.equal(`${previewOrigin}/media_abc.png`);
    expect(describeAsset({ href: './media_abc.png' }).previewHref).to.equal(undefined);
  });

  it('previews AEM Assets and legacy DA images from their own URL', () => {
    const delivery = 'https://delivery.example.com/photo.png?smartcrop=wide&width=1920';
    const legacy = 'https://content.da.live/example/site/forms/.sample/hero.png';
    expect(describeAsset({ href: delivery, previewOrigin }).previewHref).to.equal(delivery);
    expect(describeAsset({ href: legacy, previewOrigin }).previewHref).to.equal(legacy);
  });

  it('previews only web URLs', () => {
    expect(describeAsset({ href: 'data:text/html,example', previewOrigin }).previewHref)
      .to.equal(undefined);
    expect(describeAsset({ href: 'file:///private/image.png', previewOrigin }).previewHref)
      .to.equal(undefined);
  });

  it('describes an empty value as an empty file', () => {
    expect(describeAsset({ href: undefined })).to.deep.equal({ name: '', previewHref: undefined });
  });

  it('names a stored value after the decoded last path segment', () => {
    expect(describeAsset({ href: 'https://x.test/a/data%20sheet.pdf?x=1' }).name).to.equal('data sheet.pdf');
    expect(describeAsset({ href: './media_abc.png' }).name).to.equal('media_abc.png');
    expect(describeAsset({ href: 'https://x.test/%E0%A4%A' }).name).to.equal('%E0%A4%A');
  });

  it('prefers the name of a file picked in this session', () => {
    expect(describeAsset({
      href: 'https://delivery.example.com/urn:aaid:aem:1/as/photo',
      name: 'photo.webp',
    }).name).to.equal('photo.webp');
  });
});

describe('splitHrefForDisplay', () => {
  it('splits a URL into its path, file name stem and extension with query', () => {
    expect(splitHrefForDisplay('https://x.test/a.b/hero.final.png?width=750')).to.deep.equal({ base: 'https://x.test/a.b/', stem: 'hero.final', tail: '.png?width=750' });
    expect(splitHrefForDisplay('./media_abc.png'))
      .to.deep.equal({ base: './', stem: 'media_abc', tail: '.png' });
  });

  it('keeps file names without an extension whole', () => {
    expect(splitHrefForDisplay('https://x.test/a.b/urn:aaid:aem:1/play?x=1.2')).to.deep.equal({ base: 'https://x.test/a.b/urn:aaid:aem:1/', stem: 'play', tail: '?x=1.2' });
    expect(splitHrefForDisplay('https://x.test/.env'))
      .to.deep.equal({ base: 'https://x.test/', stem: '.env', tail: '' });
  });

  it('decodes the URL for reading and keeps malformed escapes', () => {
    expect(splitHrefForDisplay('https://x.test/data%20sheet.pdf').stem).to.equal('data sheet');
    expect(splitHrefForDisplay('https://x.test/%E0%A4%A.pdf').stem).to.equal('%E0%A4%A');
  });
});
