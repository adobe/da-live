import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let MAX_IMAGE_BYTES;
let isImageTooLarge;
let dataUrlByteLength;
let showImageTooLarge;
let refuseOversizedImage;
let toasts;

before(async () => {
  ({
    MAX_IMAGE_BYTES,
    isImageTooLarge,
    dataUrlByteLength,
    showImageTooLarge,
    refuseOversizedImage,
  } = await import('../../../../../blocks/canvas/utils/image-upload.js'));
  ({ toasts } = await import('../../../../fixtures/nx2/blocks/shared/toast/toast.js'));
});

// isHlx6 memoizes its answer per site, so each case needs its own org/site
function stubPing(upgraded) {
  const saved = window.fetch;
  window.fetch = async () => new Response('', {
    status: 200,
    headers: upgraded ? { 'x-api-upgrade-available': 'true' } : {},
  });
  return () => { window.fetch = saved; };
}

beforeEach(() => {
  toasts.length = 0;
});

afterEach(() => {
  window.localStorage.removeItem('hlx6-upgrade');
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
    expect(toasts[0].text).to.equal('Image upload failed. Image size must be 4.5 MB or under');
  });
});

describe('refuseOversizedImage', () => {
  it('refuses an oversized image on a source bus site', async () => {
    const restore = stubPing(true);
    try {
      expect(await refuseOversizedImage(MAX_IMAGE_BYTES + 1, '/refsb/refsb/dir')).to.equal(true);
      expect(toasts).to.have.length(1);
    } finally {
      restore();
    }
  });

  it('takes an oversized image on a legacy site, where the limit does not apply', async () => {
    const restore = stubPing(false);
    try {
      expect(await refuseOversizedImage(MAX_IMAGE_BYTES + 1, '/reflg/reflg/dir')).to.equal(false);
      expect(toasts).to.have.length(0);
    } finally {
      restore();
    }
  });

  it('takes an image inside the limit without probing the store', async () => {
    let probed = false;
    const saved = window.fetch;
    window.fetch = async () => {
      probed = true;
      return new Response('', { status: 200 });
    };
    try {
      expect(await refuseOversizedImage(MAX_IMAGE_BYTES, '/refok/refok')).to.equal(false);
      expect(probed, 'the store was probed for a file inside the limit').to.equal(false);
    } finally {
      window.fetch = saved;
    }
  });

  it('takes an image it cannot place in a site', async () => {
    expect(await refuseOversizedImage(MAX_IMAGE_BYTES + 1, '')).to.equal(false);
    expect(await refuseOversizedImage(MAX_IMAGE_BYTES + 1, '/orgonly')).to.equal(false);
    expect(toasts).to.have.length(0);
  });
});
