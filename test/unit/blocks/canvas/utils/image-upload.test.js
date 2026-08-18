import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let MAX_IMAGE_BYTES;
let isImageTooLarge;
let dataUrlByteLength;
let showImageTooLarge;
let toasts;

before(async () => {
  ({
    MAX_IMAGE_BYTES, isImageTooLarge, dataUrlByteLength, showImageTooLarge,
  } = await import('../../../../../blocks/canvas/utils/image-upload.js'));
  ({ toasts } = await import('../../../../fixtures/nx2/blocks/shared/toast/toast.js'));
});

beforeEach(() => {
  toasts.length = 0;
});

describe('image upload limit', () => {
  it('caps an upload below the api service request limit', () => {
    // the AWS edge answers 413 above 4,717,360 bytes, measured 2026-08-18
    expect(MAX_IMAGE_BYTES).to.be.below(4717360);
  });

  it('takes a file at the limit and refuses the byte above it', () => {
    expect(isImageTooLarge(MAX_IMAGE_BYTES)).to.equal(false);
    expect(isImageTooLarge(MAX_IMAGE_BYTES + 1)).to.equal(true);
    expect(isImageTooLarge(0)).to.equal(false);
  });

  it('reads the decoded length of a data url', () => {
    expect(dataUrlByteLength('data:image/png;base64,AAAA')).to.equal(3);
    expect(dataUrlByteLength('data:image/png;base64,AAA=')).to.equal(2);
    expect(dataUrlByteLength('data:image/png;base64,AA==')).to.equal(1);
    expect(dataUrlByteLength('not a data url')).to.equal(0);
  });
});

describe('showImageTooLarge', () => {
  it('names the failure and the limit', async () => {
    await showImageTooLarge();
    expect(toasts).to.have.length(1);
    expect(toasts[0].variant).to.equal('error');
    expect(toasts[0].text).to.equal('Image upload failed\nImage size must be 4.5 MB or under');
  });
});
