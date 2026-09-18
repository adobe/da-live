import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let HLX6_MAX_IMAGE_BYTES;
let MAX_IMAGE_BYTES;
let isImageTooLarge;
let dataUrlByteLength;
let showImageTooLarge;
let refuseOversizedImage;
let toasts;

before(async () => {
  ({
    HLX6_MAX_IMAGE_BYTES,
    MAX_IMAGE_BYTES,
    isImageTooLarge,
    dataUrlByteLength,
    showImageTooLarge,
    refuseOversizedImage,
  } = await import('../../../../../blocks/canvas/utils/image-upload.js'));
  ({ toasts } = await import('../../../../fixtures/nx2/blocks/shared/toast/toast.js'));
});

// isHlx6 memoizes its answer per site, so each case needs its own org/site.
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
  it('keeps the hlx6 cap below the api service request limit', () => {
    // the AWS edge answers 413 above 4,717,360 bytes, measured 2026-08-18
    expect(HLX6_MAX_IMAGE_BYTES).to.be.below(4717360);
  });

  it('caps legacy sites at the documented 20 MB image limit', () => {
    expect(MAX_IMAGE_BYTES).to.equal(20_000_000);
  });

  it('compares against a caller-supplied limit', () => {
    expect(isImageTooLarge(HLX6_MAX_IMAGE_BYTES, HLX6_MAX_IMAGE_BYTES)).to.equal(false);
    expect(isImageTooLarge(HLX6_MAX_IMAGE_BYTES + 1, HLX6_MAX_IMAGE_BYTES)).to.equal(true);
  });

  it('reads the decoded length of a data url', () => {
    expect(dataUrlByteLength('data:image/png;base64,AAAA')).to.equal(3);
    expect(dataUrlByteLength('data:image/png;base64,AAA=')).to.equal(2);
    expect(dataUrlByteLength('data:image/png;base64,AA==')).to.equal(1);
    expect(dataUrlByteLength('not a data url')).to.equal(0);
  });
});

describe('showImageTooLarge', () => {
  it('names the resolved limit', async () => {
    await showImageTooLarge(4.5);
    expect(toasts).to.have.length(1);
    expect(toasts[0].variant).to.equal('error');
    expect(toasts[0].text).to.equal('Max image size allowed is 4.5 MB');
  });
});

describe('refuseOversizedImage', () => {
  it('refuses above 4.5 MB on an hlx6 site', async () => {
    const restore = stubPing(true);
    try {
      expect(await refuseOversizedImage(HLX6_MAX_IMAGE_BYTES + 1, '/refh6/refh6/dir')).to.equal(true);
      expect(toasts).to.have.length(1);
      expect(toasts[0].text).to.equal('Max image size allowed is 4.5 MB');
    } finally {
      restore();
    }
  });

  it('allows up to 20 MB on a legacy site', async () => {
    const restore = stubPing(false);
    try {
      // over the 4.5 MB hlx6 cap but under the legacy 20 MB limit
      expect(await refuseOversizedImage(HLX6_MAX_IMAGE_BYTES + 1, '/reflg/reflg/dir')).to.equal(false);
      expect(await refuseOversizedImage(MAX_IMAGE_BYTES + 1, '/reflg/reflg/dir')).to.equal(true);
      expect(toasts).to.have.length(1);
      expect(toasts[0].text).to.equal('Max image size allowed is 20 MB');
    } finally {
      restore();
    }
  });

  it('takes an image inside the strict cap without probing the store', async () => {
    let probed = false;
    const saved = window.fetch;
    window.fetch = async () => {
      probed = true;
      return new Response('', { status: 200 });
    };
    try {
      expect(await refuseOversizedImage(HLX6_MAX_IMAGE_BYTES, '/refok/refok')).to.equal(false);
      expect(probed, 'the store was probed for a small image').to.equal(false);
      expect(toasts).to.have.length(0);
    } finally {
      window.fetch = saved;
    }
  });
});
