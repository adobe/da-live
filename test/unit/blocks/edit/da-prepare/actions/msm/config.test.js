import { expect } from '@esm-bundle/chai';
import {
  getSatellites,
  getBaseSite,
  isPageLocal,
  checkOverrides,
  clearMsmCache,
} from '../../../../../../../blocks/edit/da-prepare/actions/msm/helpers/config.js';

const ORG_CONFIG = {
  msm: {
    data: [
      { base: 'mccs', satellite: '', title: 'MCCS Global' },
      { base: 'mccs', satellite: 'san-diego-mccs', title: 'San Diego MCCS' },
      { base: 'mccs', satellite: 'camp-pendleton-mccs', title: 'Camp Pendleton MCCS' },
      { base: 'mccs', satellite: 'miramar-mccs', title: 'Miramar MCCS' },
    ],
  },
};

const SIMPLE_ORG_CONFIG = {
  msm: {
    data: [
      { satellite: 'san-diego-mccs', title: 'San Diego MCCS' },
      { satellite: 'camp-pendleton-mccs', title: 'Camp Pendleton MCCS' },
      { satellite: 'miramar-mccs', title: 'Miramar MCCS' },
    ],
  },
};

describe('MSM config', () => {
  let savedFetch;
  let savedLocalStorage;

  beforeEach(() => {
    savedFetch = window.fetch;
    savedLocalStorage = window.localStorage.getItem('nx-ims');
    window.localStorage.removeItem('nx-ims');
    clearMsmCache();
  });

  afterEach(() => {
    window.fetch = savedFetch;
    if (savedLocalStorage) {
      window.localStorage.setItem('nx-ims', savedLocalStorage);
    } else {
      window.localStorage.removeItem('nx-ims');
    }
  });

  describe('getSatellites', () => {
    it('returns satellites from a base site config', async () => {
      window.fetch = () => Promise.resolve(
        new Response(JSON.stringify(ORG_CONFIG), { status: 200 }),
      );

      const satellites = await getSatellites('org-base', 'mccs');
      expect(Object.keys(satellites)).to.have.length(3);
      expect(satellites['san-diego-mccs'].label).to.equal('San Diego MCCS');
      expect(satellites['camp-pendleton-mccs'].label).to.equal('Camp Pendleton MCCS');
      expect(satellites['miramar-mccs'].label).to.equal('Miramar MCCS');
    });

    it('returns empty object when fetch fails', async () => {
      window.fetch = () => Promise.resolve(new Response('', { status: 404 }));

      const satellites = await getSatellites('org-fail', 'mccs');
      expect(satellites).to.deep.equal({});
    });

    it('returns empty object when called on a satellite site', async () => {
      window.fetch = () => Promise.resolve(
        new Response(JSON.stringify(ORG_CONFIG), { status: 200 }),
      );

      const satellites = await getSatellites('org-sat', 'san-diego-mccs');
      expect(satellites).to.deep.equal({});
    });

    it('returns empty object when data is empty', async () => {
      window.fetch = () => Promise.resolve(
        new Response(JSON.stringify({ msm: { data: [] } }), { status: 200 }),
      );

      const satellites = await getSatellites('org-empty', 'mccs');
      expect(satellites).to.deep.equal({});
    });

    it('caches config across calls', async () => {
      let callCount = 0;
      window.fetch = () => {
        callCount += 1;
        return Promise.resolve(
          new Response(JSON.stringify(ORG_CONFIG), { status: 200 }),
        );
      };

      await getSatellites('org-cache', 'mccs');
      await getSatellites('org-cache', 'mccs');
      expect(callCount).to.equal(1);
    });

    it('returns satellites without base column when site is not a satellite', async () => {
      window.fetch = () => Promise.resolve(
        new Response(JSON.stringify(SIMPLE_ORG_CONFIG), { status: 200 }),
      );

      const satellites = await getSatellites('org-simple', 'mccs');
      expect(Object.keys(satellites)).to.have.length(3);
      expect(satellites['san-diego-mccs'].label).to.equal('San Diego MCCS');
    });

    it('returns empty object without base column when site is a satellite', async () => {
      window.fetch = () => Promise.resolve(
        new Response(JSON.stringify(SIMPLE_ORG_CONFIG), { status: 200 }),
      );

      const satellites = await getSatellites('org-simple-sat', 'san-diego-mccs');
      expect(satellites).to.deep.equal({});
    });
  });

  describe('getBaseSite', () => {
    it('returns base site from a satellite site', async () => {
      window.fetch = () => Promise.resolve(
        new Response(JSON.stringify(ORG_CONFIG), { status: 200 }),
      );

      const base = await getBaseSite('org-getbase', 'san-diego-mccs');
      expect(base).to.equal('mccs');
    });

    it('returns null when called on a base site', async () => {
      window.fetch = () => Promise.resolve(
        new Response(JSON.stringify(ORG_CONFIG), { status: 200 }),
      );

      const base = await getBaseSite('org-getbase-null', 'mccs');
      expect(base).to.be.null;
    });

    it('returns null when fetch fails', async () => {
      window.fetch = () => Promise.resolve(new Response('', { status: 404 }));

      const base = await getBaseSite('org-getbase-fail', 'unknown-site');
      expect(base).to.be.null;
    });

    it('returns null when data is empty', async () => {
      window.fetch = () => Promise.resolve(
        new Response(JSON.stringify({ msm: { data: [] } }), { status: 200 }),
      );

      const base = await getBaseSite('org-getbase-empty', 'san-diego-mccs');
      expect(base).to.be.null;
    });
  });

  describe('isPageLocal', () => {
    it('returns true when HEAD returns 200', async () => {
      window.fetch = (url, opts) => {
        expect(opts.method).to.equal('HEAD');
        return Promise.resolve(new Response('', { status: 200 }));
      };

      const result = await isPageLocal('org', 'san-diego-mccs', '/about');
      expect(result).to.be.true;
    });

    it('returns false when HEAD returns 404', async () => {
      window.fetch = () => Promise.resolve(new Response('', { status: 404 }));

      const result = await isPageLocal('org', 'san-diego-mccs', '/about');
      expect(result).to.be.false;
    });
  });

  describe('checkOverrides', () => {
    it('returns override status for all satellites', async () => {
      window.fetch = (url) => {
        if (url.includes('san-diego-mccs')) {
          return Promise.resolve(new Response('', { status: 200 }));
        }
        return Promise.resolve(new Response('', { status: 404 }));
      };

      const satellites = {
        'san-diego-mccs': { label: 'San Diego MCCS' },
        'camp-pendleton-mccs': { label: 'Camp Pendleton MCCS' },
      };

      const results = await checkOverrides('org', satellites, '/about');
      expect(results).to.have.length(2);

      const sdResult = results.find((r) => r.site === 'san-diego-mccs');
      expect(sdResult.hasOverride).to.be.true;
      expect(sdResult.label).to.equal('San Diego MCCS');

      const cpResult = results.find((r) => r.site === 'camp-pendleton-mccs');
      expect(cpResult.hasOverride).to.be.false;
    });

    it('handles empty satellites', async () => {
      const results = await checkOverrides('org', {}, '/about');
      expect(results).to.deep.equal([]);
    });
  });

  describe('clearMsmCache', () => {
    it('clears site-level cache so role is re-resolved', async () => {
      window.fetch = () => Promise.resolve(
        new Response(JSON.stringify(ORG_CONFIG), { status: 200 }),
      );

      const satellites = await getSatellites('org-clear', 'mccs');
      expect(Object.keys(satellites)).to.have.length(3);

      clearMsmCache();

      const base = await getBaseSite('org-clear', 'san-diego-mccs');
      expect(base).to.equal('mccs');
    });
  });
});
