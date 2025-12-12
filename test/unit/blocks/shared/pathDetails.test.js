import { expect } from '@esm-bundle/chai';
import '../../milo.js';

// Dynamic import because Milo dependency
const { default: getPathDetails } = await import('../../../../blocks/shared/pathDetails.js');

describe('Path details', () => {
  describe('Org only', () => {
    describe('Config', () => {
      it('Handles folder config (/)', () => {
        const loc = { pathname: '/config', hash: '#/adobe/' };
        const details = getPathDetails(loc);
        expect(details.origin).to.equal('https://admin.da.live');
        expect(details.fullpath).to.equal('/adobe/');
        expect(details.repo).to.equal(undefined);
        expect(details.sourceUrl).to.equal('https://admin.da.live/config/adobe');
        expect(details.name).to.equal('config');
        expect(details.parent).to.equal('/adobe');
        expect(details.parentName).to.equal('adobe');
      });

      it('Handles JSON config (.json)', () => {
        const loc = { pathname: '/config', hash: '#/adobe.json' };
        const details = getPathDetails(loc);
        expect(details.fullpath).to.equal('/adobe.json');
        expect(details.sourceUrl).to.equal('https://admin.da.live/config/adobe.json');
        expect(details.parent).to.equal('/');
        expect(details.parentName).to.equal('Root');
      });

      it('Handles HTML config ()', () => {
        const loc = { pathname: '/config', hash: '#/adobe' };
        const details = getPathDetails(loc);
        expect(details.fullpath).to.equal('/adobe.html');
        expect(details.sourceUrl).to.equal('https://admin.da.live/config/adobe.html');
      });
    });

    describe('Sheet', () => {
      it('Handles JSON sheet ()', () => {
        const loc = { pathname: '/sheet', hash: '#/adobe' };
        const details = getPathDetails(loc);
        expect(details.fullpath).to.equal('/adobe.json');
        expect(details.sourceUrl).to.equal('https://admin.da.live/source/adobe.json');
      });
    });

    describe('Edit ()', () => {
      it('Handles HTML edit details ()', () => {
        const loc = { pathname: '/edit', hash: '#/adobe' };
        const details = getPathDetails(loc);
        expect(details.fullpath).to.equal('/adobe.html');
        expect(details.sourceUrl).to.equal('https://admin.da.live/source/adobe.html');
      });
    });

    describe('Cached result', () => {
      it('Handles HTML edit details ()', () => {
        const loc = { pathname: '/edit', hash: '#/adobe' };
        const details = getPathDetails(loc);
        const cachedLoc = { pathname: '/edit', hash: '#/adobe' };
        const cached = getPathDetails(cachedLoc);
        expect(cached).to.deep.equal(details);
      });
    });
  });

  describe('Org and repo', () => {
    describe('Config', () => {
      it('Handles folder config (/)', () => {
        const loc = { pathname: '/config', hash: '#/adobe/geometrixx/' };
        const details = getPathDetails(loc);
        expect(details.fullpath).to.equal('/adobe/geometrixx/');
        expect(details.repo).to.equal('geometrixx');
        expect(details.sourceUrl).to.equal('https://admin.da.live/config/adobe/geometrixx');
        expect(details.name).to.equal('geometrixx config');
        expect(details.parent).to.equal('/adobe/geometrixx');
        expect(details.parentName).to.equal('geometrixx');
      });

      it('Handles JSON config (.json)', () => {
        const loc = { pathname: '/config', hash: '#/adobe/geometrixx.json' };
        const details = getPathDetails(loc);
        expect(details.fullpath).to.equal('/adobe/geometrixx.json');
        expect(details.sourceUrl).to.equal('https://admin.da.live/config/adobe/geometrixx.json');
        expect(details.parent).to.equal('/adobe');
        expect(details.parentName).to.equal('adobe');
      });

      it('Handles HTML config ()', () => {
        const loc = { pathname: '/config', hash: '#/adobe/geometrixx' };
        const details = getPathDetails(loc);
        expect(details.fullpath).to.equal('/adobe/geometrixx.html');
        expect(details.sourceUrl).to.equal('https://admin.da.live/config/adobe/geometrixx.html');
      });
    });

    describe('Sheet', () => {
      it('Handles JSON sheet ()', () => {
        const loc = { pathname: '/sheet', hash: '#/adobe/geometrixx' };
        const details = getPathDetails(loc);
        expect(details.fullpath).to.equal('/adobe/geometrixx.json');
        expect(details.sourceUrl).to.equal('https://admin.da.live/source/adobe/geometrixx.json');
      });
    });

    describe('Edit ()', () => {
      it('Handles HTML edit ()', () => {
        const loc = { pathname: '/edit', hash: '#/adobe/geometrixx' };
        const details = getPathDetails(loc);
        expect(details.fullpath).to.equal('/adobe/geometrixx.html');
        expect(details.sourceUrl).to.equal('https://admin.da.live/source/adobe/geometrixx.html');
      });
    });
  });

  describe('Org, repo, and path', () => {
    describe('Config', () => {
      it('Handles folder config (/)', () => {
        const loc = { pathname: '/config', hash: '#/adobe/geometrixx/testing-123/' };
        const details = getPathDetails(loc);
        expect(details.fullpath).to.equal('/adobe/geometrixx/testing-123/');
        expect(details.repo).to.equal('geometrixx');
        expect(details.sourceUrl).to.equal('https://admin.da.live/config/adobe/geometrixx/testing-123');
        expect(details.name).to.equal('config');
        expect(details.parent).to.equal('/adobe/geometrixx/testing-123');
        expect(details.parentName).to.equal('testing-123');
      });

      it('Handles JSON config (.json)', () => {
        const loc = { pathname: '/config', hash: '#/adobe/geometrixx/testing-123.json' };
        const details = getPathDetails(loc);
        expect(details.fullpath).to.equal('/adobe/geometrixx/testing-123.json');
        expect(details.sourceUrl).to.equal('https://admin.da.live/config/adobe/geometrixx/testing-123.json');
        expect(details.parent).to.equal('/adobe/geometrixx');
        expect(details.parentName).to.equal('geometrixx');
      });

      it('Handles HTML config ()', () => {
        const loc = { pathname: '/config', hash: '#/adobe/geometrixx/testing-123' };
        const details = getPathDetails(loc);
        expect(details.fullpath).to.equal('/adobe/geometrixx/testing-123.html');
        expect(details.sourceUrl).to.equal('https://admin.da.live/config/adobe/geometrixx/testing-123.html');
      });
    });

    describe('Sheet', () => {
      it('Handles JSON sheet ()', () => {
        const loc = { pathname: '/sheet', hash: '#/adobe/geometrixx/testing-123' };
        const details = getPathDetails(loc);
        expect(details.fullpath).to.equal('/adobe/geometrixx/testing-123.json');
        expect(details.sourceUrl).to.equal('https://admin.da.live/source/adobe/geometrixx/testing-123.json');
      });
    });

    describe('Edit ()', () => {
      it('Handles HTML edit ()', () => {
        const loc = { pathname: '/edit', hash: '#/adobe/geometrixx/testing-123' };
        const details = getPathDetails(loc);
        expect(details.fullpath).to.equal('/adobe/geometrixx/testing-123.html');
        expect(details.sourceUrl).to.equal('https://admin.da.live/source/adobe/geometrixx/testing-123.html');
      });

      it('Handles HTML edit if page has .html extension ()', () => {
        const loc = { pathname: '/edit', hash: '#/adobe/geometrixx/testing-123.html' };
        const details = getPathDetails(loc);
        expect(details.fullpath).to.equal('/adobe/geometrixx/testing-123.html');
        expect(details.sourceUrl).to.equal('https://admin.da.live/source/adobe/geometrixx/testing-123.html');
      });

      it('Handles HTML edit if page name is html and no extension ()', () => {
        const loc = { pathname: '/edit', hash: '#/adobe/geometrixx/html' };
        const details = getPathDetails(loc);
        expect(details.fullpath).to.equal('/adobe/geometrixx/html.html');
        expect(details.sourceUrl).to.equal('https://admin.da.live/source/adobe/geometrixx/html.html');
      });

      it('Handles HTML edit if page name is "ilikehtml" and no extension ()', () => {
        const loc = { pathname: '/edit', hash: '#/adobe/geometrixx/ilikehtml' };
        const details = getPathDetails(loc);
        expect(details.fullpath).to.equal('/adobe/geometrixx/ilikehtml.html');
        expect(details.sourceUrl).to.equal('https://admin.da.live/source/adobe/geometrixx/ilikehtml.html');
      });

      it('Handles HTML edit if page name is html and no extension and has .html extension ()', () => {
        const loc = { pathname: '/edit', hash: '#/adobe/geometrixx/html.html' };
        const details = getPathDetails(loc);
        expect(details.fullpath).to.equal('/adobe/geometrixx/html.html');
        expect(details.sourceUrl).to.equal('https://admin.da.live/source/adobe/geometrixx/html.html');
      });
    });
  });

  describe('Expected null results', () => {
    it('Handles no path details', () => {
      const details = getPathDetails();
      expect(details).to.equal(undefined);
    });

    it('Handles hash from IMS', () => {
      const loc = { pathname: '/', hash: '#old_hash' };
      const details = getPathDetails(loc);
      expect(details).to.equal(undefined);
    });
  });
});
