import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import { convertJsonToHtml, createEngine } from '../../../../../deps/da-sc-sdk/dist/index.js';
import { describeAsset, isAssetHref, splitHrefForDisplay } from '../../../../../blocks/form/assets/media.js';
import { IMAGE_URL } from '../helpers/sdk-types.js';

const previewOrigin = 'https://main--site--example.preview.da.live';

describe('form media values', () => {
  it('accepts Media Bus references and web URLs only', () => {
    expect(isAssetHref('./media_abc.png')).to.be.true;
    expect(isAssetHref('https://content.da.live/example/site/a.pdf')).to.be.true;
    expect(isAssetHref('./media_a b.png')).to.be.false;
    expect(isAssetHref('file:///private/image.png')).to.be.false;
    expect(isAssetHref('data:text/html,example')).to.be.false;
    expect(isAssetHref('../other-image.jpg')).to.be.false;
    expect(isAssetHref('')).to.be.false;
  });

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

  it('describes values that are not file references as an empty file', () => {
    expect(describeAsset({ href: 'data:text/html,example', previewOrigin }))
      .to.deep.equal({ name: '', assetType: 'file', previewHref: undefined });
    expect(describeAsset({ href: undefined }))
      .to.deep.equal({ name: '', assetType: 'file', previewHref: undefined });
  });

  it('names a stored value after the decoded last path segment', () => {
    expect(describeAsset({ href: 'https://x.test/a/data%20sheet.pdf?x=1' }).name).to.equal('data sheet.pdf');
    expect(describeAsset({ href: './media_abc.png' }).name).to.equal('media_abc.png');
    expect(describeAsset({ href: 'https://x.test/%E0%A4%A' }).name).to.equal('%E0%A4%A');
  });

  it('detects images the same way the SDK saves them', () => {
    expect(describeAsset({ href: 'https://x.test/photo.png' }).assetType).to.equal('image');
    expect(describeAsset({ href: 'https://images.example.com/photo-1.jpg?w=750' }).assetType).to.equal('image');
    expect(describeAsset({ href: 'https://images.example.com/photo-1?w=750' }).assetType).to.equal('file');
    expect(describeAsset({ href: 'https://x.test/spec.pdf' }))
      .to.deep.equal({ name: 'spec.pdf', assetType: 'file', previewHref: undefined });
    expect(describeAsset({ href: 'https://x.test/theme.mp3' }).assetType).to.equal('file');
  });

  it('describes videos as files without a preview', () => {
    const video = 'https://publish-p1-e1.adobeaemcloud.com/content/dam/site/biker%20video.mp4';
    expect(describeAsset({ href: video }))
      .to.deep.equal({ name: 'biker video.mp4', assetType: 'file', previewHref: undefined });
    expect(describeAsset({ href: './media_abc.mp4', previewOrigin }))
      .to.deep.equal({ name: 'media_abc.mp4', assetType: 'file', previewHref: undefined });
  });

  it('describes AEM delivery video players as files, since they have no extension', () => {
    const player = 'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:1/play';
    expect(describeAsset({ href: player, name: 'clip.mp4' }))
      .to.deep.equal({ name: 'clip.mp4', assetType: 'file', previewHref: undefined });
  });

  it('prefers the name of a file picked in this session, but judges the asset type by the URL', () => {
    expect(describeAsset({
      href: 'https://delivery.example.com/urn:aaid:aem:1/as/photo',
      name: 'photo.webp',
    })).to.include({ name: 'photo.webp', assetType: 'file' });
  });
});

// The field keeps its own copy of the SDK's image rule, so this pins both to the same result.
describe('image rule parity with the SDK', () => {
  const schema = { type: 'object', properties: { hero: { $ref: IMAGE_URL } } };
  const writesImage = (href) => {
    const json = { metadata: { schemaName: 'page' }, data: { hero: { src: href } } };
    const { model } = createEngine({ schema, document: json }).getState();
    return convertJsonToHtml({ json, model }).html.includes('<img ');
  };

  const hrefs = [
    './media_abc.png',
    './media_abc.JPG?width=750&format=jpg',
    'https://x.test/a/photo.jpeg#crop',
    'https://x.test/icon.svg',
    'https://x.test/anim.gif',
    'https://x.test/photo.webp',
    'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:1/as/hero.avif?smartcrop=wide',
    'https://x.test/spec.pdf',
    'https://x.test/clip.mp4',
    'https://x.test/scan.tiff',
    'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:1/play',
    'https://images.example.com/photo-1?w=750',
    'https://x.test/folder.png/readme',
  ];

  it('previews a value as an image exactly when the SDK writes it as an image', () => {
    const mismatches = hrefs.filter(
      (href) => (describeAsset({ href }).assetType === 'image') !== writesImage(href),
    );
    expect(mismatches).to.deep.equal([]);
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
