import { expect } from '@esm-bundle/chai';
import { libraryRegistration, librarySourcePath, needsPublish } from '../../../../blocks/config/library-paths.js';

describe('config library paths', () => {
  describe('library', () => {
    const lib = (rows) => ({ library: { data: rows }, ':names': ['library'], ':type': 'multi-sheet' });

    it('finds the site library registration, ignoring case and spaces', () => {
      const site = lib([{ title: 'templates ', path: '/site.json' }]);
      expect(libraryRegistration(site, 'Templates').path).to.equal('/site.json');
      expect(libraryRegistration(site, 'Icons')).to.equal(null);
      expect(libraryRegistration(null, 'Templates')).to.equal(null);
    });

    it('maps registered paths of this site to source paths', () => {
      const map = (path) => librarySourcePath(path, 'o', 's');
      expect(map('/library/blocks.json')).to.equal('/library/blocks.json');
      expect(map('/library/blocks')).to.equal('/library/blocks.json');
      expect(map('https://content.da.live/o/s/library/icons.json')).to.equal('/library/icons.json');
      expect(map('https://main--s--o.aem.live/placeholders.json')).to.equal('/placeholders.json');
      expect(map('https://main--da-live--o.aem.page/x.json')).to.equal(null);
      expect(map('/a.json, /b.json')).to.equal('/a.json');
    });

    it('rejects other sites, external URLs and empty values', () => {
      const map = (path) => librarySourcePath(path, 'o', 's');
      expect(map('https://content.da.live/o/other/library/icons.json')).to.equal(null);
      expect(map('https://main--other--o.aem.live/x.json')).to.equal(null);
      expect(map('https://example.com/x.json')).to.equal(null);
      expect(map('')).to.equal(null);
      expect(map(null)).to.equal(null);
    });

    it('only maps sheets: no extension or .json, in any case, with dots in folders allowed', () => {
      const map = (path) => librarySourcePath(path, 'o', 's');
      expect(map('/library/blocks.JSON')).to.equal('/library/blocks.JSON');
      expect(map('/v1.2/library/blocks')).to.equal('/v1.2/library/blocks.json');
      expect(map('/library/blocks.json.bak')).to.equal(null);
      expect(map('/library/blocks.html')).to.equal(null);
    });

    it('knows which sources need publishing', () => {
      expect(needsPublish('/library/blocks.json')).to.equal(true);
      expect(needsPublish('https://main--s--o.aem.live/x.json')).to.equal(true);
      expect(needsPublish('https://content.da.live/o/s/x.json')).to.equal(false);
    });
  });
});
