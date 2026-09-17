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

// isHlx6 and getSidekickConfig both memoize per site, so each case needs its
// own org/site. `upgraded` drives the hlx6 probe; `config` is the sidekick
// config JSON (undefined -> a 404, which the resolver treats as "no limit").
function stubFetch({ upgraded = true, config } = {}) {
  const saved = window.fetch;
  window.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/ping/')) {
      return new Response('', {
        status: 200,
        headers: upgraded ? { 'x-api-upgrade-available': 'true' } : {},
      });
    }
    if (u.includes('/sidekick') || u.includes('/config.json')) {
      if (!config) return new Response('', { status: 404 });
      return new Response(JSON.stringify(config), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('', { status: 200 });
  };
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

  it('compares against a caller-supplied limit', () => {
    expect(isImageTooLarge(1_000_000, 2_000_000)).to.equal(false);
    expect(isImageTooLarge(2_000_001, 2_000_000)).to.equal(true);
  });

  it('reads the decoded length of a data url', () => {
    expect(dataUrlByteLength('data:image/png;base64,AAAA')).to.equal(3);
    expect(dataUrlByteLength('data:image/png;base64,AAA=')).to.equal(2);
    expect(dataUrlByteLength('data:image/png;base64,AA==')).to.equal(1);
    expect(dataUrlByteLength('not a data url')).to.equal(0);
  });
});

describe('showImageTooLarge', () => {
  it('names the failure and the fallback limit', async () => {
    await showImageTooLarge();
    expect(toasts).to.have.length(1);
    expect(toasts[0].variant).to.equal('error');
    expect(toasts[0].text).to.equal('Max image size allowed is 4.5 MB');
  });

  it('names a configured limit', async () => {
    await showImageTooLarge(20);
    expect(toasts).to.have.length(1);
    expect(toasts[0].text).to.equal('Max image size allowed is 20 MB');
  });
});

describe('refuseOversizedImage', () => {
  it('refuses an oversized image using the fallback when no limit is configured', async () => {
    const restore = stubFetch({ upgraded: true, config: {} });
    try {
      expect(await refuseOversizedImage(MAX_IMAGE_BYTES + 1, '/refsb/refsb/dir')).to.equal(true);
      expect(toasts).to.have.length(1);
      expect(toasts[0].text).to.equal('Max image size allowed is 4.5 MB');
    } finally {
      restore();
    }
  });

  it('honors a smaller imageSizeLimit from the sidekick config', async () => {
    const restore = stubFetch({ upgraded: true, config: { imageSizeLimit: 1 } });
    try {
      expect(await refuseOversizedImage(1_000_000, '/reflg/reflg/dir')).to.equal(false);
      expect(await refuseOversizedImage(1_000_001, '/reflg/reflg/dir')).to.equal(true);
      expect(toasts).to.have.length(1);
      expect(toasts[0].text).to.equal('Max image size allowed is 1 MB');
    } finally {
      restore();
    }
  });

  it('clamps an imageSizeLimit above the backend ceiling', async () => {
    const restore = stubFetch({ upgraded: true, config: { imageSizeLimit: 20 } });
    try {
      // a 20 MB config cannot raise the limit past the 4.5 MB backend ceiling
      expect(await refuseOversizedImage(MAX_IMAGE_BYTES, '/refclamp/refclamp/dir')).to.equal(false);
      expect(await refuseOversizedImage(MAX_IMAGE_BYTES + 1, '/refclamp/refclamp/dir')).to.equal(true);
      expect(toasts).to.have.length(1);
      expect(toasts[0].text).to.equal('Max image size allowed is 4.5 MB');
    } finally {
      restore();
    }
  });

  it('applies the fallback limit on a legacy site too', async () => {
    const restore = stubFetch({ upgraded: false, config: {} });
    try {
      expect(await refuseOversizedImage(MAX_IMAGE_BYTES + 1, '/oversized/images/dir')).to.equal(true);
      expect(toasts).to.have.length(1);
    } finally {
      restore();
    }
  });

  it('takes an image inside the limit', async () => {
    const restore = stubFetch({ upgraded: true, config: {} });
    try {
      expect(await refuseOversizedImage(MAX_IMAGE_BYTES, '/refuses/refused/dir')).to.equal(false);
      expect(toasts).to.have.length(0);
    } finally {
      restore();
    }
  });

  it('enforces the fallback when the site cannot be resolved', async () => {
    expect(await refuseOversizedImage(MAX_IMAGE_BYTES + 1, '')).to.equal(true);
    expect(await refuseOversizedImage(MAX_IMAGE_BYTES + 1, '/orgonly')).to.equal(true);
    expect(toasts).to.have.length(2);
  });
});
