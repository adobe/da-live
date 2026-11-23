import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { getSettingsMenuItems } = await import('../../../../../blocks/browse/shared/settings-menu.js');

describe('settings menu', () => {
  describe('getSettingsMenuItems', () => {
    const SHEET = { divider: true };

    it('lists the config editor, permissions, then the config sheet for the org', () => {
      expect(getSettingsMenuItems({ org: 'org', canEditOrgConfig: true })).to.deep.equal([
        { id: '/config/edit#/org', label: 'Configuration' },
        { id: '/config/permissions#/org', label: 'Permissions' },
        SHEET,
        { id: '/config#/org/', label: 'Config Sheet' },
      ]);
    });

    it('hides org permissions when the user cannot edit the org config', () => {
      expect(getSettingsMenuItems({ org: 'org' })).to.deep.equal([
        { id: '/config/edit#/org', label: 'Configuration' },
        SHEET,
        { id: '/config#/org/', label: 'Config Sheet' },
      ]);
    });

    it('lists the config editor, permissions, then the config sheet for a site', () => {
      expect(getSettingsMenuItems({ org: 'org', site: 'site', canEditOrgConfig: true })).to.deep.equal([
        { id: '/config/edit#/org/site', label: 'Configuration' },
        { id: '/config/permissions#/org/site', label: 'Permissions' },
        SHEET,
        { id: '/config#/org/site/', label: 'Config Sheet' },
      ]);
    });

    it('hides site permissions when the user cannot edit the org config', () => {
      expect(getSettingsMenuItems({ org: 'org', site: 'site', canEditOrgConfig: false })).to.deep.equal([
        { id: '/config/edit#/org/site', label: 'Configuration' },
        SHEET,
        { id: '/config#/org/site/', label: 'Config Sheet' },
      ]);
    });
  });
});
