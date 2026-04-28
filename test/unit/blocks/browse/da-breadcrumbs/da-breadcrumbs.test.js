/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
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
      el.fullpath = '/org/site/folder';
      el.getBreadcrumbs();
      expect(el._breadcrumbs).to.deep.equal([
        { name: 'org', path: '#/org' },
        { name: 'site', path: '#/org/site' },
        { name: 'folder', path: '#/org/site/folder' },
      ]);
    });

    it('Filters empty parts from leading/trailing slashes', () => {
      const el = new DaBreadcrumbs();
      el.fullpath = '/org/site/';
      el.getBreadcrumbs();
      expect(el._breadcrumbs.map((c) => c.name)).to.deep.equal(['org', 'site']);
    });

    it('Returns empty list for root', () => {
      const el = new DaBreadcrumbs();
      el.fullpath = '/';
      el.getBreadcrumbs();
      expect(el._breadcrumbs).to.deep.equal([]);
    });
  });

  describe('renderConfig', () => {
    it('Returns a config link for the last crumb when depth <= 2', () => {
      const el = new DaBreadcrumbs();
      el.depth = 2;
      const result = el.renderConfig(2, { path: '#/org/site' }, 1);
      expect(result).to.not.equal(null);
    });

    it('Returns null when depth > 2', () => {
      const el = new DaBreadcrumbs();
      el.depth = 3;
      const result = el.renderConfig(3, { path: '#/org/site/page' }, 2);
      expect(result).to.equal(null);
    });

    it('Returns null when not on the last crumb', () => {
      const el = new DaBreadcrumbs();
      el.depth = 2;
      const result = el.renderConfig(2, { path: '#/org' }, 0);
      expect(result).to.equal(null);
    });
  });
});
