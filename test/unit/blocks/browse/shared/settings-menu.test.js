import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const {
  getSettingsMenuItems,
  getSettingsHref,
  canEditOrgConfig,
} = await import('../../../../../blocks/browse/shared/settings-menu.js');

describe('settings menu', () => {
  describe('getSettingsMenuItems', () => {
    it('returns org configuration and permissions at the org root', () => {
      expect(getSettingsMenuItems({ org: 'org' })).to.deep.equal([
        { id: 'config', label: 'Org Configuration', href: '/config#/org/' },
        { id: 'permissions', label: 'Org Permissions', href: '/config/permissions#/org' },
      ]);
    });

    it('returns site configuration and permissions when the user can edit the org config', () => {
      expect(getSettingsMenuItems({ org: 'org', site: 'site', canEditOrgConfig: true })).to.deep.equal([
        { id: 'config', label: 'Site Configuration', href: '/config#/org/site/' },
        { id: 'permissions', label: 'Site Permissions', href: '/config/permissions#/org/site' },
      ]);
    });

    it('hides site permissions when the user cannot edit the org config', () => {
      expect(getSettingsMenuItems({ org: 'org', site: 'site', canEditOrgConfig: false })).to.deep.equal([
        { id: 'config', label: 'Site Configuration', href: '/config#/org/site/' },
      ]);
      expect(getSettingsMenuItems({ org: 'org', site: 'site' }).map(({ id }) => id))
        .to.deep.equal(['config']);
    });
  });

  describe('getSettingsHref', () => {
    it('returns the href of the selected item, undefined for unknown ids', () => {
      const items = getSettingsMenuItems({ org: 'org', site: 'site', canEditOrgConfig: true });
      expect(getSettingsHref(items, 'permissions')).to.equal('/config/permissions#/org/site');
      expect(getSettingsHref(items, 'config')).to.equal('/config#/org/site/');
      expect(getSettingsHref(items, 'nope')).to.be.undefined;
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
