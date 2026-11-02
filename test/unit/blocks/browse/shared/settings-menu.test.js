import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { getSettingsMenuItems } = await import('../../../../../blocks/browse/shared/settings-menu.js');

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
});
