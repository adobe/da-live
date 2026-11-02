import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const {
  getSettingsMenuItems,
  canEditOrgConfig,
} = await import('../../../../../blocks/browse/shared/settings-menu.js');

describe('settings menu', () => {
  describe('getSettingsMenuItems', () => {
    it('returns org configuration and permissions at the org root', () => {
      expect(getSettingsMenuItems({ org: 'org' })).to.deep.equal([
        { id: '/config#/org/', label: 'Configuration' },
        { id: '/config/permissions#/org', label: 'Permissions' },
      ]);
    });

    it('returns site configuration and permissions when the user can edit the org config', () => {
      expect(getSettingsMenuItems({ org: 'org', site: 'site', canEditOrgConfig: true })).to.deep.equal([
        { id: '/config#/org/site/', label: 'Configuration' },
        { id: '/config/permissions#/org/site', label: 'Permissions' },
      ]);
    });

    it('hides site permissions when the user cannot edit the org config', () => {
      expect(getSettingsMenuItems({ org: 'org', site: 'site', canEditOrgConfig: false })).to.deep.equal([
        { id: '/config#/org/site/', label: 'Configuration' },
      ]);
      expect(getSettingsMenuItems({ org: 'org', site: 'site' }).map(({ label }) => label))
        .to.deep.equal(['Configuration']);
    });
  });

  describe('canEditOrgConfig', () => {
    let savedFetch;
    beforeEach(() => {
      savedFetch = window.fetch;
      window.localStorage.removeItem('nx-ims');
    });
    afterEach(() => { window.fetch = savedFetch; });

    const mockActions = (actions) => {
      window.fetch = async (url) => {
        if (String(url).includes('/ping/')) return new Response('', { status: 200 });
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'X-da-actions': `/x=${actions}` },
        });
      };
    };

    it('is true when the org config grants write', async () => {
      mockActions('read,write');
      expect(await canEditOrgConfig('settings-write')).to.be.true;
    });

    it('is false when the org config grants only read', async () => {
      mockActions('read');
      expect(await canEditOrgConfig('settings-read')).to.be.false;
    });

    it('is false when the config fetch fails without an x-da-actions header', async () => {
      window.fetch = async (url) => {
        if (String(url).includes('/ping/')) return new Response('', { status: 200 });
        return new Response('', { status: 500 });
      };
      expect(await canEditOrgConfig('settings-500')).to.be.false;
      window.fetch = async (url) => {
        if (String(url).includes('/ping/')) return new Response('', { status: 200 });
        return new Response('', { status: 403 });
      };
      expect(await canEditOrgConfig('settings-403')).to.be.false;
    });

    it('trusts the header on 404 (org without a config yet)', async () => {
      window.fetch = async (url) => {
        if (String(url).includes('/ping/')) return new Response('', { status: 200 });
        return new Response('', { status: 404, headers: { 'X-da-actions': '/x=read,write' } });
      };
      expect(await canEditOrgConfig('settings-404')).to.be.true;
    });

    it('is false when the config fetch throws', async () => {
      window.fetch = async () => { throw new Error('offline'); };
      expect(await canEditOrgConfig('settings-throw')).to.be.false;
    });

    it('is false without an org, without fetching', async () => {
      let called = false;
      window.fetch = async () => {
        called = true;
        return new Response('');
      };
      expect(await canEditOrgConfig('')).to.be.false;
      expect(called).to.be.false;
    });
  });
});
