/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

describe('DaSites', () => {
  let DaSites;
  let savedFetch;

  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    savedFetch = window.fetch;
    // Stub fetch for the css module loaded by sheet.js
    window.fetch = () => Promise.resolve(new Response('', { status: 200 }));
    const mod = await import('../../../../../blocks/browse/da-sites/da-sites.js');
    DaSites = mod.default;
    window.fetch = savedFetch;
  });

  beforeEach(() => {
    localStorage.removeItem('da-sites');
    localStorage.removeItem('da-orgs');
  });

  describe('parseSubdomain', () => {
    it('Extracts org and repo from a hlx.live URL', () => {
      const el = new DaSites();
      const result = el.parseSubdomain('https://main--repo--org.hlx.live/');
      expect(result).to.equal('#/org/repo');
    });

    it('Extracts org and repo from an aem.page URL', () => {
      const el = new DaSites();
      const result = el.parseSubdomain('https://main--my-site--my-org.aem.page/');
      expect(result).to.equal('#/my-org/my-site');
    });

    it('Returns null for an unrelated hostname', () => {
      const el = new DaSites();
      expect(el.parseSubdomain('https://example.com/')).to.equal(null);
    });

    it('Returns null for a malformed helix-style hostname missing org', () => {
      const el = new DaSites();
      expect(el.parseSubdomain('https://main--repo.hlx.live/')).to.equal(null);
    });

    it('Returns null when the URL is invalid', () => {
      const el = new DaSites();
      expect(el.parseSubdomain('not a url')).to.equal(null);
    });
  });

  describe('getRecents', () => {
    it('Maps localStorage da-sites to _recents and clears da-orgs', () => {
      localStorage.setItem('da-sites', JSON.stringify(['org/site1', 'org/site2']));
      localStorage.setItem('da-orgs', JSON.stringify(['oldorg']));
      const el = new DaSites();
      el.getRecents();
      expect(el._recents).to.have.length(2);
      expect(el._recents[0].name).to.equal('org/site1');
      expect(el._recents[0].img).to.match(/^\/blocks\/browse\/da-sites\/img\/cards\/da-\d+\.jpg$/);
      expect(localStorage.getItem('da-orgs')).to.equal(null);
    });

    it('Falls back to da-orgs when da-sites is empty', () => {
      localStorage.setItem('da-orgs', JSON.stringify(['acme', 'globex']));
      const el = new DaSites();
      el.getRecents();
      expect(el._recents).to.have.length(2);
      expect(el._recents.map((r) => r.name)).to.deep.equal(['acme', 'globex']);
    });

    it('Leaves _recents undefined when both stores are empty', () => {
      const el = new DaSites();
      el.getRecents();
      expect(el._recents).to.equal(undefined);
    });
  });

  describe('handleRemove', () => {
    it('Splices from _recents and updates localStorage', () => {
      localStorage.setItem('da-sites', JSON.stringify(['org/a', 'org/b']));
      const el = new DaSites();
      el.getRecents();
      el.requestUpdate = () => {};
      el.handleRemove(el._recents[0]);
      expect(el._recents).to.have.length(1);
      expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal(['org/b']);
    });
  });

  describe('handleFlip', () => {
    it('Toggles the flipped flag on the site', () => {
      const el = new DaSites();
      el.requestUpdate = () => {};
      const site = { flipped: false };
      const evt = { preventDefault: () => {}, stopPropagation: () => {} };
      el.handleFlip(evt, site);
      expect(site.flipped).to.be.true;
      el.handleFlip(evt, site);
      expect(site.flipped).to.be.false;
    });
  });

  describe('setStatus', () => {
    it('Sets a status object with text/description/type', () => {
      const el = new DaSites();
      el.setStatus('Hi', 'desc', 'success');
      expect(el._status).to.deep.equal({ text: 'Hi', description: 'desc', type: 'success' });
    });

    it('Clears the status when text is omitted', () => {
      const el = new DaSites();
      el._status = { text: 'x', description: '', type: 'info' };
      el.setStatus();
      expect(el._status).to.equal(null);
    });
  });

  describe('handleGo', () => {
    it('Sets _urlError when the URL cannot be parsed', async () => {
      const el = new DaSites();
      const target = { siteUrl: 'invalid' };
      const e = {
        preventDefault: () => {},
        target: {
          // FormData-compatible iterable
          [Symbol.iterator]: function* iter() { yield ['siteUrl', target.siteUrl]; },
        },
      };
      // Stub FormData to read our pseudo-target
      const RealFormData = window.FormData;
      window.FormData = class {
        constructor() { this.entries = [['siteUrl', target.siteUrl]]; }

        * [Symbol.iterator]() { yield* this.entries; }
      };
      try {
        await el.handleGo(e);
      } finally {
        window.FormData = RealFormData;
      }
      expect(el._urlError).to.be.true;
    });

    it('Does nothing when siteUrl is empty (early return)', async () => {
      const el = new DaSites();
      // Constructor sets _urlError = false; an early return should leave it false.
      const RealFormData = window.FormData;
      window.FormData = class {
        constructor() { this.entries = [['siteUrl', '']]; }

        * [Symbol.iterator]() { yield* this.entries; }
      };
      try {
        await el.handleGo({ preventDefault: () => {}, target: {} });
      } finally {
        window.FormData = RealFormData;
      }
      expect(el._urlError).to.equal(false);
    });
  });

  describe('handleShare', () => {
    it('Writes the share URL to the clipboard and sets a status', async () => {
      const el = new DaSites();
      const RealClipboard = navigator.clipboard;
      let captured;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { write: (data) => { captured = data; return Promise.resolve(); } },
      });
      try {
        el.handleShare('org/site');
        await new Promise((r) => { setTimeout(r, 0); });
        expect(captured).to.exist;
        expect(el._status.text).to.equal('Copied');
      } finally {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: RealClipboard });
      }
    });
  });

  describe('mapRecentSites / mapRecentOrgs', () => {
    it('mapRecentSites builds the expected card shape', () => {
      const el = new DaSites();
      el.mapRecentSites(['acme/site1']);
      expect(el._recents).to.have.length(1);
      expect(el._recents[0].name).to.equal('acme/site1');
      expect(el._recents[0].img).to.match(/\/blocks\/browse\/da-sites\/img\/cards\/da-\d+\.jpg/);
      expect(el._recents[0].style).to.match(/^da-card-style-\d+$/);
    });

    it('mapRecentOrgs builds the expected card shape', () => {
      const el = new DaSites();
      el.mapRecentOrgs(['acme', 'globex']);
      expect(el._recents.map((r) => r.name)).to.deep.equal(['acme', 'globex']);
    });
  });
});
