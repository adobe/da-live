/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { nothing } from 'da-lit';
import { setNx } from '../../../../../scripts/utils.js';

describe('DaBreadcrumbs', () => {
  let DaBreadcrumbs;

  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    const mod = await import('../../../../../blocks/browse/da-breadcrumbs/da-breadcrumbs.js');
    DaBreadcrumbs = mod.default;
  });

  describe('getBreadcrumbs', () => {
    it('Splits a 3-segment path into ordered crumbs', () => {
      const el = new DaBreadcrumbs();
      el.details = { fullpath: '/org/site/folder' };
      el.getBreadcrumbs();
      expect(el._breadcrumbs).to.deep.equal([
        { name: 'org', path: '#/org' },
        { name: 'site', path: '#/org/site' },
        { name: 'folder', path: '#/org/site/folder' },
      ]);
    });

    it('Filters empty parts from leading/trailing slashes', () => {
      const el = new DaBreadcrumbs();
      el.details = { fullpath: '/org/site/' };
      el.getBreadcrumbs();
      expect(el._breadcrumbs.map((c) => c.name)).to.deep.equal(['org', 'site']);
    });

    it('Returns empty list for root', () => {
      const el = new DaBreadcrumbs();
      el.details = { fullpath: '/' };
      el.getBreadcrumbs();
      expect(el._breadcrumbs).to.deep.equal([]);
    });
  });

  describe('renderConfig', () => {
    it('Returns a config link when details has no path', () => {
      const el = new DaBreadcrumbs();
      el.details = {};
      const result = el.renderConfig({ path: '#/org/site' });
      expect(result).to.not.equal(nothing);
    });

    it('Returns nothing when details.path is set', () => {
      const el = new DaBreadcrumbs();
      el.details = { path: '/org/site' };
      const result = el.renderConfig({ path: '#/org/site' });
      expect(result).to.equal(nothing);
    });
  });
});
