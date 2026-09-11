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

  describe('getRecents', () => {
    it('Maps localStorage da-sites to _recents without an image field', () => {
      localStorage.setItem('da-sites', JSON.stringify(['org/site1', 'org/site2']));
      const el = new DaSites();
      el._recents = el.getRecents();
      expect(el._recents).to.have.length(2);
      expect(el._recents[0].name).to.equal('org/site1');
      expect(el._recents[0].img).to.equal(undefined);
      expect(el._recents[0].style).to.match(/^da-thumb-\d+$/);
    });

    it('Returns null when da-sites is empty', () => {
      const el = new DaSites();
      expect(el.getRecents()).to.equal(null);
    });

    it('Assigns a stable gradient class for a given site name', () => {
      localStorage.setItem('da-sites', JSON.stringify(['acme/site1']));
      const a = new DaSites();
      a._recents = a.getRecents();
      const b = new DaSites();
      b._recents = b.getRecents();
      expect(a._recents[0].style).to.equal(b._recents[0].style);
    });
  });

  describe('handleRemove', () => {
    it('Splices from _recents and updates localStorage', () => {
      localStorage.setItem('da-sites', JSON.stringify(['org/a', 'org/b']));
      const el = new DaSites();
      el._recents = el.getRecents();
      el.requestUpdate = () => {};
      el.handleRemove(el._recents[0]);
      expect(el._recents).to.have.length(1);
      expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal(['org/b']);
    });
  });

  describe('handleMenuSelect', () => {
    it('Shares the site when the selected id is "share"', () => {
      const el = new DaSites();
      let shared;
      el.handleShare = (name) => { shared = name; };
      el.handleMenuSelect({ detail: { id: 'share' } }, { name: 'org/site' });
      expect(shared).to.equal('org/site');
    });

    it('Removes the site when the selected id is "hide"', () => {
      localStorage.setItem('da-sites', JSON.stringify(['org/a', 'org/b']));
      const el = new DaSites();
      el._recents = el.getRecents();
      el.requestUpdate = () => {};
      el.handleMenuSelect({ detail: { id: 'hide' } }, el._recents[0]);
      expect(el._recents).to.have.length(1);
      expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal(['org/b']);
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

  describe('getRecents card shape', () => {
    it('Builds cards for multiple sites', () => {
      localStorage.setItem('da-sites', JSON.stringify(['acme/site1', 'globex/site2']));
      const el = new DaSites();
      el._recents = el.getRecents();
      expect(el._recents.map((r) => r.name)).to.deep.equal(['acme/site1', 'globex/site2']);
    });
  });
});
