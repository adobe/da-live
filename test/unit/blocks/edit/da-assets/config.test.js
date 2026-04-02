import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { getRepositoryConfig, getResponsiveImageConfig, parseMimeRenditions } = await import('../../../../../blocks/edit/da-assets/helpers/config.js');

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeSheet(entries) {
  return { ok: true, json: async () => ({ data: entries }) };
}

function makeFetch(responses) {
  return async (url) => {
    for (const [pattern, response] of Object.entries(responses)) {
      if (url.includes(pattern)) return response;
    }
    return { ok: false };
  };
}

// ---------------------------------------------------------------------------
// getRepositoryConfig
// ---------------------------------------------------------------------------

describe('getRepositoryConfig', () => {
  it('returns tierType author for author- repositoryId', async () => {
    const orgFetch = window.fetch;
    window.fetch = makeFetch({
      '/rcfg/author/': makeSheet([
        { key: 'aem.repositoryId', value: 'author-p10-e10.adobeaemcloud.com' },
      ]),
    });
    try {
      const cfg = await getRepositoryConfig('rcfg', 'author');
      expect(cfg.tierType).to.equal('author');
      expect(cfg.repositoryId).to.equal('author-p10-e10.adobeaemcloud.com');
      expect(cfg.assetOrigin).to.equal('publish-p10-e10.adobeaemcloud.com');
      expect(cfg.assetBasePath).to.equal('/adobe/assets');
      expect(cfg.isDmEnabled).to.be.false;
      expect(cfg.isSmartCrop).to.be.false;
      expect(cfg.insertAsLink).to.be.false;
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('returns tierType delivery for delivery- repositoryId', async () => {
    const orgFetch = window.fetch;
    window.fetch = makeFetch({
      '/rcfg/delivery/': makeSheet([
        { key: 'aem.repositoryId', value: 'delivery-p20-e20.adobeaemcloud.com' },
      ]),
    });
    try {
      const cfg = await getRepositoryConfig('rcfg', 'delivery');
      expect(cfg.tierType).to.equal('delivery');
      expect(cfg.assetOrigin).to.equal('delivery-p20-e20.adobeaemcloud.com');
      expect(cfg.assetBasePath).to.equal('/adobe/assets');
      expect(cfg.isDmEnabled).to.be.true;
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('sets isDmEnabled when aem.asset.dm.delivery is on', async () => {
    const orgFetch = window.fetch;
    window.fetch = makeFetch({
      '/rcfg/dmenabled/': makeSheet([
        { key: 'aem.repositoryId', value: 'author-p30-e30.adobeaemcloud.com' },
        { key: 'aem.asset.dm.delivery', value: 'on' },
      ]),
    });
    try {
      const cfg = await getRepositoryConfig('rcfg', 'dmenabled');
      expect(cfg.isDmEnabled).to.be.true;
      expect(cfg.assetOrigin).to.equal('delivery-p30-e30.adobeaemcloud.com');
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('sets isSmartCrop when aem.asset.smartcrop.select is on', async () => {
    const orgFetch = window.fetch;
    window.fetch = makeFetch({
      '/rcfg/smartcrop/': makeSheet([
        { key: 'aem.repositoryId', value: 'author-p40-e40.adobeaemcloud.com' },
        { key: 'aem.asset.smartcrop.select', value: 'on' },
      ]),
    });
    try {
      const cfg = await getRepositoryConfig('rcfg', 'smartcrop');
      expect(cfg.isSmartCrop).to.be.true;
      expect(cfg.isDmEnabled).to.be.true;
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('uses custom prod origin when aem.assets.prod.origin is set', async () => {
    const orgFetch = window.fetch;
    window.fetch = makeFetch({
      '/rcfg/prodorigin/': makeSheet([
        { key: 'aem.repositoryId', value: 'author-p50-e50.adobeaemcloud.com' },
        { key: 'aem.assets.prod.origin', value: 'https://mysite.com' },
      ]),
    });
    try {
      const cfg = await getRepositoryConfig('rcfg', 'prodorigin');
      expect(cfg.assetOrigin).to.equal('https://mysite.com');
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('sets insertAsLink when aem.assets.image.type is link', async () => {
    const orgFetch = window.fetch;
    window.fetch = makeFetch({
      '/rcfg/linktype/': makeSheet([
        { key: 'aem.repositoryId', value: 'author-p60-e60.adobeaemcloud.com' },
        { key: 'aem.assets.image.type', value: 'link' },
      ]),
    });
    try {
      const cfg = await getRepositoryConfig('rcfg', 'linktype');
      expect(cfg.insertAsLink).to.be.true;
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('uses custom prod basepath when aem.assets.prod.basepath is set', async () => {
    const orgFetch = window.fetch;
    window.fetch = makeFetch({
      '/rcfg/prodbasepath/': makeSheet([
        { key: 'aem.repositoryId', value: 'author-p70-e70.adobeaemcloud.com' },
        { key: 'aem.assets.prod.basepath', value: '/my/custom/assets' },
      ]),
    });
    try {
      const cfg = await getRepositoryConfig('rcfg', 'prodbasepath');
      expect(cfg.assetBasePath).to.equal('/my/custom/assets');
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('returns null when aem.repositoryId is not configured', async () => {
    const orgFetch = window.fetch;
    window.fetch = makeFetch({ '/rcfg/missing/': makeSheet([]) });
    try {
      const cfg = await getRepositoryConfig('rcfg', 'missing');
      expect(cfg).to.be.null;
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('sets image/* wildcard in mimeRenditionOverrides when configured via aem.asset.mime.renditions', async () => {
    const orgFetch = window.fetch;
    window.fetch = makeFetch({
      '/rcfg/origimg/': makeSheet([
        { key: 'aem.repositoryId', value: 'author-p80-e80.adobeaemcloud.com' },
        { key: 'aem.asset.mime.renditions', value: 'image/*:original' },
      ]),
    });
    try {
      const cfg = await getRepositoryConfig('rcfg', 'origimg');
      expect(cfg.mimeRenditionOverrides['image/*']).to.equal('original');
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('sets video/* wildcard in mimeRenditionOverrides when configured via aem.asset.mime.renditions', async () => {
    const orgFetch = window.fetch;
    window.fetch = makeFetch({
      '/rcfg/origvid/': makeSheet([
        { key: 'aem.repositoryId', value: 'author-p90-e90.adobeaemcloud.com' },
        { key: 'aem.asset.mime.renditions', value: 'video/*:original' },
      ]),
    });
    try {
      const cfg = await getRepositoryConfig('rcfg', 'origvid');
      expect(cfg.mimeRenditionOverrides['video/*']).to.equal('original');
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('mimeRenditionOverrides has no wildcard entries when aem.asset.mime.renditions is absent', async () => {
    const orgFetch = window.fetch;
    window.fetch = makeFetch({
      '/rcfg/norendition/': makeSheet([
        { key: 'aem.repositoryId', value: 'author-p95-e95.adobeaemcloud.com' },
      ]),
    });
    try {
      const cfg = await getRepositoryConfig('rcfg', 'norendition');
      expect(cfg.mimeRenditionOverrides['image/*']).to.be.undefined;
      expect(cfg.mimeRenditionOverrides['video/*']).to.be.undefined;
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('parses aem.asset.mime.renditions and returns mimeRenditionOverrides', async () => {
    const orgFetch = window.fetch;
    window.fetch = makeFetch({
      '/rcfg/mimerenditions/': makeSheet([
        { key: 'aem.repositoryId', value: 'author-p96-e96.adobeaemcloud.com' },
        { key: 'aem.asset.mime.renditions', value: 'application/x-photoshop:avif, application/pdf:original' },
      ]),
    });
    try {
      const cfg = await getRepositoryConfig('rcfg', 'mimerenditions');
      expect(cfg.mimeRenditionOverrides['application/x-photoshop']).to.equal('avif');
      expect(cfg.mimeRenditionOverrides['application/pdf']).to.equal('original');
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('mimeRenditionOverrides is an empty map when aem.asset.mime.renditions is absent', async () => {
    const orgFetch = window.fetch;
    window.fetch = makeFetch({
      '/rcfg/nomimekey/': makeSheet([
        { key: 'aem.repositoryId', value: 'author-p97-e97.adobeaemcloud.com' },
      ]),
    });
    try {
      const cfg = await getRepositoryConfig('rcfg', 'nomimekey');
      expect(cfg.mimeRenditionOverrides).to.deep.equal({});
    } finally {
      window.fetch = orgFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// parseMimeRenditions
// ---------------------------------------------------------------------------

describe('parseMimeRenditions', () => {
  it('returns an empty map when configValue is null and no defaults provided', () => {
    const result = parseMimeRenditions(null);
    expect(result).to.deep.equal({});
  });

  it('returns a copy of provided defaults when configValue is null', () => {
    const result = parseMimeRenditions(null, { 'image/vnd.adobe.photoshop': 'avif' });
    expect(result).to.deep.equal({ 'image/vnd.adobe.photoshop': 'avif' });
  });

  it('returns a copy of provided defaults when configValue is empty string', () => {
    const result = parseMimeRenditions('', { 'application/x-photoshop': 'avif' });
    expect(result).to.deep.equal({ 'application/x-photoshop': 'avif' });
  });

  it('parses a single mimetype:renditiontype entry', () => {
    const result = parseMimeRenditions('application/pdf:original', {});
    expect(result['application/pdf']).to.equal('original');
  });

  it('parses multiple comma-separated entries', () => {
    const result = parseMimeRenditions('image/vnd.adobe.photoshop:avif, application/pdf:original', {});
    expect(result['image/vnd.adobe.photoshop']).to.equal('avif');
    expect(result['application/pdf']).to.equal('original');
  });

  it('merges config entries on top of defaults', () => {
    const defaults = { 'image/vnd.adobe.photoshop': 'avif', 'application/pdf': 'original' };
    const result = parseMimeRenditions('image/vnd.adobe.photoshop:original', defaults);
    expect(result['image/vnd.adobe.photoshop']).to.equal('original');
    expect(result['application/pdf']).to.equal('original');
  });

  it('normalises mime types and rendition types to lowercase', () => {
    const result = parseMimeRenditions('IMAGE/VND.ADOBE.PHOTOSHOP:AVIF', {});
    expect(result['image/vnd.adobe.photoshop']).to.equal('avif');
  });

  it('ignores entries that are missing the colon separator', () => {
    const result = parseMimeRenditions('application/pdf', {});
    expect(result).to.deep.equal({});
  });

  it('handles extra whitespace around entries and separators', () => {
    const result = parseMimeRenditions('  application/zip : original  ,  text/csv : original  ', {});
    expect(result['application/zip']).to.equal('original');
    expect(result['text/csv']).to.equal('original');
  });

  it('does not mutate the defaults object', () => {
    const defaults = { 'application/pdf': 'original' };
    parseMimeRenditions('application/pdf:avif', defaults);
    expect(defaults['application/pdf']).to.equal('original');
  });
});

// ---------------------------------------------------------------------------
// getResponsiveImageConfig
// ---------------------------------------------------------------------------

function makeMultiSheetWithResponsive(crops) {
  return {
    ok: true,
    json: async () => ({
      ':type': 'multi-sheet',
      data: { data: [] },
      'responsive-images': { data: crops },
    }),
  };
}

describe('getResponsiveImageConfig', () => {
  it('returns null when owner and repo are both absent', async () => {
    const result = await getResponsiveImageConfig(null, null);
    expect(result).to.be.null;
  });

  it('returns false when config has no responsive-images sheet', async () => {
    const orgFetch = window.fetch;
    window.fetch = async () => ({ ok: true, json: async () => ({ data: [] }) });
    try {
      const result = await getResponsiveImageConfig('ri1', 'none');
      expect(result).to.be.false;
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('parses crops string into array from responsive-images sheet', async () => {
    const orgFetch = window.fetch;
    window.fetch = async () => makeMultiSheetWithResponsive([
      { name: 'Full Width', position: 'everywhere', crops: 'desktop, mobile' },
    ]);
    try {
      const result = await getResponsiveImageConfig('ri2', 'crops');
      expect(result).to.be.an('array');
      expect(result[0].name).to.equal('Full Width');
      expect(result[0].crops).to.deep.equal(['desktop', 'mobile']);
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('handles crops with no spaces around comma', async () => {
    const orgFetch = window.fetch;
    window.fetch = async () => makeMultiSheetWithResponsive([
      { name: 'Tight', position: 'hero', crops: 'small,medium,large' },
    ]);
    try {
      const result = await getResponsiveImageConfig('ri3', 'tight');
      expect(result[0].crops).to.deep.equal(['small', 'medium', 'large']);
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('falls back to org-level config when repo config has no responsive-images', async () => {
    const orgFetch = window.fetch;
    window.fetch = async (url) => {
      if (url.includes('/ri4/fallback/')) return { ok: true, json: async () => ({ data: [] }) };
      return makeMultiSheetWithResponsive([
        { name: 'Org Wide', position: 'outside-blocks', crops: 'wide' },
      ]);
    };
    try {
      const result = await getResponsiveImageConfig('ri4', 'fallback');
      expect(result[0].name).to.equal('Org Wide');
    } finally {
      window.fetch = orgFetch;
    }
  });
});
