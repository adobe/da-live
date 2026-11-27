import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { getSettingsMenuItems } = await import('../../../../../../blocks/browse/da-browse/shared/settings-menu.js');

describe('settings menu', () => {
  describe('getSettingsMenuItems', () => {
    const DIVIDER = { divider: true };

    it('lists the config editor, permissions, then the config sheet for the org', () => {
      expect(getSettingsMenuItems({ org: 'org', canEditOrgConfig: true })).to.deep.equal([
        { id: '/config/edit#/org', label: 'Configuration', trailing: { type: 'badge', label: 'New' } },
        { id: '/config/permissions#/org', label: 'Permissions' },
        DIVIDER,
        { id: '/config#/org/', label: 'Config Sheet' },
      ]);
    });

    it('only lists the org config sheet when the user cannot edit the org config', () => {
      expect(getSettingsMenuItems({ org: 'org' })).to.deep.equal([
        { id: '/config#/org/', label: 'Config Sheet' },
      ]);
    });

    it('lists the config editor, permissions, then the config sheet for a site', () => {
      expect(getSettingsMenuItems({ org: 'org', site: 'site', canEditOrgConfig: true })).to.deep.equal([
        { id: '/config/edit#/org/site', label: 'Configuration', trailing: { type: 'badge', label: 'New' } },
        { id: '/config/permissions#/org/site', label: 'Permissions' },
        DIVIDER,
        { id: '/config#/org/site/', label: 'Config Sheet' },
      ]);
    });

    it('only lists the site config sheet when the user cannot edit the org config', () => {
      expect(getSettingsMenuItems({ org: 'org', site: 'site', canEditOrgConfig: false })).to.deep.equal([
        { id: '/config#/org/site/', label: 'Config Sheet' },
      ]);
    });
  });
});
