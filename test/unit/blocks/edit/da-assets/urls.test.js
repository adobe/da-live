import { expect } from '@esm-bundle/chai';

import {
  buildAuthorUrl,
  buildDmUrl,
  buildDeliveryUrl,
  buildSmartCropUrl,
  buildSmartCropsListUrl,
  resolveRenditionType,
  getAssetAlt,
  getDmApprovalStatus,
} from '../../../../../blocks/edit/da-assets/helpers/urls.js';

// ---------------------------------------------------------------------------
// Sample asset objects
// ---------------------------------------------------------------------------

const AUTHOR_IMAGE = {
  name: 'mountain.jpg',
  path: '/content/dam/photos/mountain.jpg',
  mimetype: 'image/jpeg',
  'repo:id': 'urn:aaid:aem:abc-123',
  _links: {
    'http://ns.adobe.com/adobecloud/rel/rendition': [
      { href: 'https://author-p1-e1.adobeaemcloud.com/renditions/mountain.jpg' },
    ],
  },
  _embedded: {
    'http://ns.adobe.com/adobecloud/rel/metadata/asset': {
      'dc:description': 'A mountain view',
      'dam:assetStatus': 'approved',
      'dam:activationTarget': 'delivery',
    },
  },
};

const AUTHOR_VIDEO = {
  name: 'clip.mp4',
  path: '/content/dam/videos/clip.mp4',
  mimetype: 'video/mp4',
  'repo:id': 'urn:aaid:aem:vid-456',
  _links: {
    'http://ns.adobe.com/adobecloud/rel/rendition': [
      { href: 'https://publish-p1-e1.adobeaemcloud.com/videos/clip.mp4/play' },
    ],
  },
  _embedded: { 'http://ns.adobe.com/adobecloud/rel/metadata/asset': { 'dam:assetStatus': 'draft' } },
};

const DELIVERY_IMAGE = {
  'repo:assetId': 'urn:aaid:aem:del-789',
  'repo:name': 'sunset.jpg',
  'repo:repositoryId': 'delivery-p99-e99.adobeaemcloud.com',
  'dc:format': 'image/jpeg',
};

const DELIVERY_VIDEO = {
  'repo:assetId': 'urn:aaid:aem:del-vid-000',
  'repo:name': 'promo.mp4',
  'repo:repositoryId': 'delivery-p99-e99.adobeaemcloud.com',
  'dc:format': 'video/mp4',
};

const DELIVERY_NO_EXT = {
  'repo:assetId': 'urn:aaid:aem:del-noext',
  'repo:name': 'logofile',
  'repo:repositoryId': 'delivery-p99-e99.adobeaemcloud.com',
  'dc:format': 'image/png',
};

// ---------------------------------------------------------------------------
// buildAuthorUrl
// ---------------------------------------------------------------------------

describe('buildAuthorUrl', () => {
  it('builds URL from asset.path for images', () => {
    const url = buildAuthorUrl(AUTHOR_IMAGE, 'publish-p1-e1.adobeaemcloud.com');
    expect(url).to.equal('https://publish-p1-e1.adobeaemcloud.com/content/dam/photos/mountain.jpg');
  });

  it('uses play rendition link for video', () => {
    const videoAsset = {
      ...AUTHOR_VIDEO,
      _links: {
        'http://ns.adobe.com/adobecloud/rel/rendition': [
          { href: 'https://publish-p1-e1.adobeaemcloud.com/videos/clip.mp4/play' },
        ],
      },
    };
    const url = buildAuthorUrl(videoAsset, 'publish-p1-e1.adobeaemcloud.com');
    expect(url).to.equal('https://publish-p1-e1.adobeaemcloud.com/videos/clip.mp4/play');
  });

  it('falls back to path for video when no play link exists', () => {
    const noLinks = { ...AUTHOR_VIDEO, _links: {} };
    const url = buildAuthorUrl(noLinks, 'publish-p1-e1.adobeaemcloud.com');
    expect(url).to.equal('https://publish-p1-e1.adobeaemcloud.com/content/dam/videos/clip.mp4');
  });
});

// ---------------------------------------------------------------------------
// buildDmUrl
// ---------------------------------------------------------------------------

const AUTHOR_PDF = {
  name: 'brochure.pdf',
  path: '/content/dam/docs/brochure.pdf',
  mimetype: 'application/pdf',
  'repo:id': 'urn:aaid:aem:pdf-001',
  _links: {},
  _embedded: {
    'http://ns.adobe.com/adobecloud/rel/metadata/asset': {
      'dam:assetStatus': 'approved',
      'dam:activationTarget': 'delivery',
    },
  },
};

describe('buildDmUrl', () => {
  it('builds DM image URL from repo:id with .avif extension', () => {
    const url = buildDmUrl(AUTHOR_IMAGE, 'delivery-p1-e1.adobeaemcloud.com');
    expect(url).to.equal('https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:abc-123/as/mountain.avif');
  });

  it('builds DM video URL with /play endpoint', () => {
    const url = buildDmUrl(AUTHOR_VIDEO, 'delivery-p1-e1.adobeaemcloud.com');
    expect(url).to.equal('https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:vid-456/play');
  });

  it('builds DM PDF URL with /original path', () => {
    const url = buildDmUrl(AUTHOR_PDF, 'delivery-p1-e1.adobeaemcloud.com');
    expect(url).to.equal('https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:pdf-001/original/as/brochure.pdf');
  });

  it('builds DM CSV URL with /original path', () => {
    const csvAsset = { name: 'data.csv', mimetype: 'text/csv', 'repo:id': 'urn:aaid:aem:csv-001' };
    const url = buildDmUrl(csvAsset, 'delivery-p1-e1.adobeaemcloud.com');
    expect(url).to.equal('https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:csv-001/original/as/data.csv');
  });

  it('supports custom base path for DM URLs', () => {
    const url = buildDmUrl(AUTHOR_IMAGE, 'delivery-p1-e1.adobeaemcloud.com', '/custom-assets');
    expect(url).to.equal('https://delivery-p1-e1.adobeaemcloud.com/custom-assets/urn:aaid:aem:abc-123/as/mountain.avif');
  });

  it('serves image as original when image/* wildcard is set to original', () => {
    const url = buildDmUrl(AUTHOR_IMAGE, 'delivery-p1-e1.adobeaemcloud.com', '/adobe/assets', { mimeRenditionOverrides: { 'image/*': 'original' } });
    expect(url).to.equal('https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:abc-123/original/as/mountain.jpg');
  });

  it('serves video as original when video/* wildcard is set to original', () => {
    const url = buildDmUrl(AUTHOR_VIDEO, 'delivery-p1-e1.adobeaemcloud.com', '/adobe/assets', { mimeRenditionOverrides: { 'video/*': 'original' } });
    expect(url).to.equal('https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:vid-456/original/as/clip.mp4');
  });

  it('serves PSD (image/vnd.adobe.photoshop) as avif even when image/* wildcard is original (exact match wins)', () => {
    const psdAsset = { name: 'design.psd', mimetype: 'image/vnd.adobe.photoshop', 'repo:id': 'urn:aaid:aem:psd-001' };
    const url = buildDmUrl(psdAsset, 'delivery-p1-e1.adobeaemcloud.com', '/adobe/assets', { mimeRenditionOverrides: { 'image/*': 'original', 'image/vnd.adobe.photoshop': 'avif' } });
    expect(url).to.equal('https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:psd-001/as/design.avif');
  });

  it('serves PSD (application/x-photoshop) as original by default (no config override)', () => {
    const psdAsset = { name: 'layout.psd', mimetype: 'application/x-photoshop', 'repo:id': 'urn:aaid:aem:psd-002' };
    const url = buildDmUrl(psdAsset, 'delivery-p1-e1.adobeaemcloud.com');
    expect(url).to.equal('https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:psd-002/original/as/layout.psd');
  });

  it('serves PSD (application/x-photoshop) as avif when configured via mimeRenditionOverrides', () => {
    const psdAsset = { name: 'layout.psd', mimetype: 'application/x-photoshop', 'repo:id': 'urn:aaid:aem:psd-002' };
    const url = buildDmUrl(psdAsset, 'delivery-p1-e1.adobeaemcloud.com', '/adobe/assets', { mimeRenditionOverrides: { 'application/x-photoshop': 'avif' } });
    expect(url).to.equal('https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:psd-002/as/layout.avif');
  });
});

const DELIVERY_PDF = {
  'repo:assetId': 'urn:aaid:aem:del-pdf-111',
  'repo:name': 'whitepaper.pdf',
  'repo:repositoryId': 'delivery-p99-e99.adobeaemcloud.com',
  'dc:format': 'application/pdf',
};

const DELIVERY_CSV = {
  'repo:assetId': 'urn:aaid:aem:del-csv-222',
  'repo:name': 'report.csv',
  'repo:repositoryId': 'delivery-p99-e99.adobeaemcloud.com',
  'dc:format': 'text/csv',
};

// ---------------------------------------------------------------------------
// buildDeliveryUrl
// ---------------------------------------------------------------------------

describe('buildDeliveryUrl', () => {
  it('builds delivery image URL from repo:assetId and repo:name with .avif extension', () => {
    const url = buildDeliveryUrl(DELIVERY_IMAGE);
    expect(url).to.equal('https://delivery-p99-e99.adobeaemcloud.com/adobe/assets/urn:aaid:aem:del-789/as/sunset.avif');
  });

  it('builds delivery video URL with /play endpoint', () => {
    const url = buildDeliveryUrl(DELIVERY_VIDEO);
    expect(url).to.equal('https://delivery-p99-e99.adobeaemcloud.com/adobe/assets/urn:aaid:aem:del-vid-000/play');
  });

  it('uses seo name (strips extension) in URL with .avif extension', () => {
    const url = buildDeliveryUrl(DELIVERY_IMAGE);
    // seoName = 'sunset', original ext stripped, .avif appended
    expect(url).to.include('/as/sunset.avif');
  });

  it('handles asset name without extension gracefully, appending .avif', () => {
    const url = buildDeliveryUrl(DELIVERY_NO_EXT);
    expect(url).to.include('/as/logofile.avif');
  });

  it('uses asset repo:repositoryId as host', () => {
    const url = buildDeliveryUrl(DELIVERY_IMAGE);
    expect(url).to.include('delivery-p99-e99.adobeaemcloud.com');
  });

  it('uses overrideHost instead of repo:repositoryId when provided', () => {
    const url = buildDeliveryUrl(DELIVERY_IMAGE, 'custom-delivery.example.com');
    expect(url).to.equal('https://custom-delivery.example.com/adobe/assets/urn:aaid:aem:del-789/as/sunset.avif');
    expect(url).to.not.include('delivery-p99-e99.adobeaemcloud.com');
  });

  it('builds delivery PDF URL using /original/as/ path', () => {
    const url = buildDeliveryUrl(DELIVERY_PDF);
    expect(url).to.equal('https://delivery-p99-e99.adobeaemcloud.com/adobe/assets/urn:aaid:aem:del-pdf-111/original/as/whitepaper.pdf');
  });

  it('builds delivery CSV URL using /original/as/ path', () => {
    const url = buildDeliveryUrl(DELIVERY_CSV);
    expect(url).to.equal('https://delivery-p99-e99.adobeaemcloud.com/adobe/assets/urn:aaid:aem:del-csv-222/original/as/report.csv');
  });

  it('supports custom base path for delivery URLs', () => {
    const url = buildDeliveryUrl(DELIVERY_IMAGE, undefined, '/my-assets');
    expect(url).to.equal('https://delivery-p99-e99.adobeaemcloud.com/my-assets/urn:aaid:aem:del-789/as/sunset.avif');
  });

  it('serves image as original when image/* wildcard is set to original', () => {
    const url = buildDeliveryUrl(DELIVERY_IMAGE, undefined, '/adobe/assets', { mimeRenditionOverrides: { 'image/*': 'original' } });
    expect(url).to.equal('https://delivery-p99-e99.adobeaemcloud.com/adobe/assets/urn:aaid:aem:del-789/original/as/sunset.jpg');
  });

  it('serves video as original when video/* wildcard is set to original', () => {
    const url = buildDeliveryUrl(DELIVERY_VIDEO, undefined, '/adobe/assets', { mimeRenditionOverrides: { 'video/*': 'original' } });
    expect(url).to.equal('https://delivery-p99-e99.adobeaemcloud.com/adobe/assets/urn:aaid:aem:del-vid-000/original/as/promo.mp4');
  });

  it('serves PSD (application/x-photoshop) as original by default for delivery tier', () => {
    const psdAsset = {
      'repo:assetId': 'urn:aaid:aem:del-psd-001',
      'repo:name': 'artwork.psd',
      'repo:repositoryId': 'delivery-p99-e99.adobeaemcloud.com',
      'dc:format': 'application/x-photoshop',
    };
    const url = buildDeliveryUrl(psdAsset);
    expect(url).to.equal('https://delivery-p99-e99.adobeaemcloud.com/adobe/assets/urn:aaid:aem:del-psd-001/original/as/artwork.psd');
  });

  it('serves PSD as avif for delivery tier when configured via mimeRenditionOverrides', () => {
    const psdAsset = {
      'repo:assetId': 'urn:aaid:aem:del-psd-002',
      'repo:name': 'banner.psd',
      'repo:repositoryId': 'delivery-p99-e99.adobeaemcloud.com',
      'dc:format': 'application/x-photoshop',
    };
    const url = buildDeliveryUrl(psdAsset, undefined, '/adobe/assets', { mimeRenditionOverrides: { 'application/x-photoshop': 'avif' } });
    expect(url).to.equal('https://delivery-p99-e99.adobeaemcloud.com/adobe/assets/urn:aaid:aem:del-psd-002/as/banner.avif');
  });
});

// ---------------------------------------------------------------------------
// resolveRenditionType
// ---------------------------------------------------------------------------

describe('resolveRenditionType', () => {
  it('returns avif for image/* by default', () => {
    expect(resolveRenditionType('image/jpeg')).to.equal('avif');
    expect(resolveRenditionType('image/png')).to.equal('avif');
    expect(resolveRenditionType('image/webp')).to.equal('avif');
  });

  it('returns play for video/* by default', () => {
    expect(resolveRenditionType('video/mp4')).to.equal('play');
    expect(resolveRenditionType('video/quicktime')).to.equal('play');
  });

  it('returns original for non-image/video types', () => {
    expect(resolveRenditionType('application/pdf')).to.equal('original');
    expect(resolveRenditionType('text/csv')).to.equal('original');
    expect(resolveRenditionType('application/zip')).to.equal('original');
    expect(resolveRenditionType('')).to.equal('original');
  });

  it('returns original for image/* when image/* wildcard is set to original', () => {
    expect(resolveRenditionType('image/jpeg', { mimeRenditionOverrides: { 'image/*': 'original' } })).to.equal('original');
    expect(resolveRenditionType('image/png', { mimeRenditionOverrides: { 'image/*': 'original' } })).to.equal('original');
  });

  it('returns original for video/* when video/* wildcard is set to original', () => {
    expect(resolveRenditionType('video/mp4', { mimeRenditionOverrides: { 'video/*': 'original' } })).to.equal('original');
  });

  it('exact mime match wins over prefix wildcard', () => {
    const overrides = { 'image/*': 'original', 'image/vnd.adobe.photoshop': 'avif' };
    expect(resolveRenditionType('image/vnd.adobe.photoshop', { mimeRenditionOverrides: overrides })).to.equal('avif');
    expect(resolveRenditionType('image/png', { mimeRenditionOverrides: overrides })).to.equal('original');
  });

  it('exact mime entry wins over prefix wildcard (PSD configured as avif despite image/*:original)', () => {
    const overrides = { 'image/*': 'original', 'image/vnd.adobe.photoshop': 'avif', 'application/x-photoshop': 'avif', 'application/photoshop': 'avif' };
    expect(resolveRenditionType('image/vnd.adobe.photoshop', { mimeRenditionOverrides: overrides })).to.equal('avif');
    expect(resolveRenditionType('application/x-photoshop', { mimeRenditionOverrides: overrides })).to.equal('avif');
  });

  it('respects custom mimeRenditionOverrides map', () => {
    const overrides = { 'application/msword': 'avif' };
    expect(resolveRenditionType('application/msword', { mimeRenditionOverrides: overrides })).to.equal('avif');
  });

  it('is case-insensitive for mime types', () => {
    expect(resolveRenditionType('IMAGE/JPEG')).to.equal('avif');
    expect(resolveRenditionType('Video/MP4')).to.equal('play');
  });
});

// ---------------------------------------------------------------------------
// buildSmartCropUrl
// ---------------------------------------------------------------------------

describe('buildSmartCropUrl', () => {
  it('builds smart crop URL with crop name, query param, and .avif extension', () => {
    const url = buildSmartCropUrl(AUTHOR_IMAGE, 'delivery-p1-e1.adobeaemcloud.com', 'desktop');
    expect(url).to.equal('https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:abc-123/as/desktop-mountain.avif?smartcrop=desktop');
  });

  it('supports custom base path for smart crop URLs', () => {
    const url = buildSmartCropUrl(AUTHOR_IMAGE, 'delivery-p1-e1.adobeaemcloud.com', 'desktop', '/dm-assets');
    expect(url).to.equal('https://delivery-p1-e1.adobeaemcloud.com/dm-assets/urn:aaid:aem:abc-123/as/desktop-mountain.avif?smartcrop=desktop');
  });
});

// ---------------------------------------------------------------------------
// buildSmartCropsListUrl
// ---------------------------------------------------------------------------

describe('buildSmartCropsListUrl', () => {
  it('builds smart crops list API URL', () => {
    const url = buildSmartCropsListUrl(AUTHOR_IMAGE, 'delivery-p1-e1.adobeaemcloud.com');
    expect(url).to.equal('https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:abc-123/smartCrops');
  });

  it('supports custom base path for smart crops list URL', () => {
    const url = buildSmartCropsListUrl(AUTHOR_IMAGE, 'delivery-p1-e1.adobeaemcloud.com', '/assets-api');
    expect(url).to.equal('https://delivery-p1-e1.adobeaemcloud.com/assets-api/urn:aaid:aem:abc-123/smartCrops');
  });
});

// ---------------------------------------------------------------------------
// getAssetAlt
// ---------------------------------------------------------------------------

describe('getAssetAlt', () => {
  it('returns dc:description when available', () => {
    expect(getAssetAlt(AUTHOR_IMAGE)).to.equal('A mountain view');
  });

  it('falls back to dc:title when dc:description is absent', () => {
    const asset = { _embedded: { 'http://ns.adobe.com/adobecloud/rel/metadata/asset': { 'dc:title': 'Mountain Title' } } };
    expect(getAssetAlt(asset)).to.equal('Mountain Title');
  });

  it('returns empty string when no metadata', () => {
    expect(getAssetAlt({})).to.equal('');
    expect(getAssetAlt(DELIVERY_IMAGE)).to.equal('');
  });
});

// ---------------------------------------------------------------------------
// getDmApprovalStatus
// ---------------------------------------------------------------------------

describe('getDmApprovalStatus', () => {
  it('returns status and activationTarget from _embedded metadata', () => {
    const result = getDmApprovalStatus(AUTHOR_IMAGE);
    expect(result.status).to.equal('approved');
    expect(result.activationTarget).to.equal('delivery');
  });

  it('returns undefined values when no metadata present', () => {
    const result = getDmApprovalStatus(DELIVERY_IMAGE);
    expect(result.status).to.be.undefined;
    expect(result.activationTarget).to.be.undefined;
  });

  it('returns draft status correctly', () => {
    const result = getDmApprovalStatus(AUTHOR_VIDEO);
    expect(result.status).to.equal('draft');
  });
});
