import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../../scripts/utils.js');
setNx('/bheuaark/', { hostname: 'localhost' });

const { getConfKey, getRepositoryConfig, getResponsiveImageConfig } = await import('../../../../../blocks/edit/da-assets/helpers/config.js');

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
// getConfKey
// ---------------------------------------------------------------------------

describe('getConfKey', () => {
  it('returns value from repo-level config', async () => {
    const orgFetch = window.fetch;
    window.fetch = makeFetch({
      '/myorg/myrepo/': makeSheet([{ key: 'aem.repositoryId', value: 'author-p1-e1.adobeaemcloud.com' }]),
    });
    try {
      // Clear module-level cache by importing fresh; instead exercise with distinct owner/repo
      const val = await getConfKey('myorg', 'myrepo', 'aem.repositoryId');
      expect(val).to.equal('author-p1-e1.adobeaemcloud.com');
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('falls back to org-level config when key is absent in repo config', async () => {
    const orgFetch = window.fetch;
    window.fetch = makeFetch({
      '/orgfallback/norepo/': makeSheet([]), // repo config has no key
      '/orgfallback/': makeSheet([{ key: 'aem.repositoryId', value: 'author-p2-e2.adobeaemcloud.com' }]),
    });
    try {
      const val = await getConfKey('orgfallback', 'norepo', 'aem.repositoryId');
      expect(val).to.equal('author-p2-e2.adobeaemcloud.com');
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('returns null when neither level has the key', async () => {
    const orgFetch = window.fetch;
    window.fetch = makeFetch({
      '/nokey/norepo/': makeSheet([]),
      '/nokey/': makeSheet([]),
    });
    try {
      const val = await getConfKey('nokey', 'norepo', 'aem.repositoryId');
      expect(val).to.be.null;
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('returns null when owner and repo are both absent', async () => {
    const val = await getConfKey(null, null, 'aem.repositoryId');
    expect(val).to.be.null;
  });
});

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

  it('returns null when aem.repositoryId is not configured', async () => {
    const orgFetch = window.fetch;
    window.fetch = makeFetch({
      '/rcfg/missing/': makeSheet([]),
    });
    try {
      const cfg = await getRepositoryConfig('rcfg', 'missing');
      expect(cfg).to.be.null;
    } finally {
      window.fetch = orgFetch;
    }
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
