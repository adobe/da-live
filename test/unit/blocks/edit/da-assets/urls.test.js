import { expect } from '@esm-bundle/chai';

import {
  buildAuthorUrl,
  buildDmUrl,
  buildDeliveryUrl,
  buildSmartCropUrl,
  buildSmartCropsListUrl,
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
  it('builds DM image URL from repo:id', () => {
    const url = buildDmUrl(AUTHOR_IMAGE, 'delivery-p1-e1.adobeaemcloud.com');
    expect(url).to.equal('https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:abc-123/as/mountain.jpg');
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
  it('builds delivery image URL from repo:assetId and repo:name', () => {
    const url = buildDeliveryUrl(DELIVERY_IMAGE);
    expect(url).to.equal('https://delivery-p99-e99.adobeaemcloud.com/adobe/assets/urn:aaid:aem:del-789/as/sunset.jpg');
  });

  it('builds delivery video URL with /play endpoint', () => {
    const url = buildDeliveryUrl(DELIVERY_VIDEO);
    expect(url).to.equal('https://delivery-p99-e99.adobeaemcloud.com/adobe/assets/urn:aaid:aem:del-vid-000/play');
  });

  it('uses seo name (strips extension) in URL with correct extension', () => {
    const url = buildDeliveryUrl(DELIVERY_IMAGE);
    // seoName = 'sunset', ext = 'jpg'
    expect(url).to.include('/as/sunset.jpg');
  });

  it('handles asset name without extension gracefully', () => {
    const url = buildDeliveryUrl(DELIVERY_NO_EXT);
    expect(url).to.include('/as/logofile');
  });

  it('uses asset repo:repositoryId as host', () => {
    const url = buildDeliveryUrl(DELIVERY_IMAGE);
    expect(url).to.include('delivery-p99-e99.adobeaemcloud.com');
  });

  it('builds delivery PDF URL using /original/as/ path', () => {
    const url = buildDeliveryUrl(DELIVERY_PDF);
    expect(url).to.equal('https://delivery-p99-e99.adobeaemcloud.com/adobe/assets/urn:aaid:aem:del-pdf-111/original/as/whitepaper.pdf');
  });

  it('builds delivery CSV URL using /original/as/ path', () => {
    const url = buildDeliveryUrl(DELIVERY_CSV);
    expect(url).to.equal('https://delivery-p99-e99.adobeaemcloud.com/adobe/assets/urn:aaid:aem:del-csv-222/original/as/report.csv');
  });
});

// ---------------------------------------------------------------------------
// buildSmartCropUrl
// ---------------------------------------------------------------------------

describe('buildSmartCropUrl', () => {
  it('builds smart crop URL with crop name and query param', () => {
    const url = buildSmartCropUrl(AUTHOR_IMAGE, 'delivery-p1-e1.adobeaemcloud.com', 'desktop');
    expect(url).to.equal('https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:abc-123/as/desktop-mountain.jpg?smartcrop=desktop');
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
