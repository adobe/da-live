import { expect } from '@esm-bundle/chai';
import '../../milo.js';

// Dynamic import because Milo dependency
const { default: getPathDetails } = await import('../../../../blocks/shared/pathDetails.js');

describe('Path details', () => {
  describe('Edit with trailing slash', () => {
    it('Strips trailing slash from org-only path and treats as HTML', () => {
      const loc = { pathname: '/edit', hash: '#/adobe/' };
      const details = getPathDetails(loc);
      expect(details.fullpath).to.equal('/adobe.html');
      expect(details.depth).to.equal(1);
      expect(details.view).to.equal('edit');
    });

    it('Strips trailing slash from org+repo path and treats as HTML', () => {
      const loc = { pathname: '/edit', hash: '#/adobe/geometrixx/' };
      const details = getPathDetails(loc);
      expect(details.fullpath).to.equal('/adobe/geometrixx.html');
      expect(details.depth).to.equal(2);
    });

    it('Strips trailing slash from org+repo+path and treats as HTML', () => {
      const loc = { pathname: '/edit', hash: '#/adobe/geometrixx/testing-123/' };
      const details = getPathDetails(loc);
      expect(details.fullpath).to.equal('/adobe/geometrixx/testing-123.html');
      expect(details.depth).to.equal(3);
    });

    it('Does not strip trailing slash in browse view at org+repo depth', () => {
      const loc = { pathname: '/', hash: '#/adobe/geometrixx/' };
      const details = getPathDetails(loc);
      expect(details.fullpath).to.equal('/adobe/geometrixx/');
    });

    it('Does not strip trailing slash in browse view at org+repo+path depth', () => {
      const loc = { pathname: '/', hash: '#/adobe/geometrixx/testing-123/' };
      const details = getPathDetails(loc);
      expect(details.fullpath).to.equal('/adobe/geometrixx/testing-123/');
    });

    it('Calls history.replaceState to remove trailing slash when no loc provided', () => {
      const originalUrl = window.location.href;
      const replaceStateCalls = [];
      const originalReplaceState = history.replaceState;
      history.replaceState = (...args) => { replaceStateCalls.push(args); };

      // Use pushState to set pathname to /edit with a unique trailing-slash hash
      history.pushState(null, '', '/edit#/adobe/geometrixx/replacestate-trail-test/');

      try {
        getPathDetails();
        expect(replaceStateCalls.length).to.equal(1);
        expect(replaceStateCalls[0][2]).to.include('#/adobe/geometrixx/replacestate-trail-test');
        expect(replaceStateCalls[0][2]).to.not.include('#/adobe/geometrixx/replacestate-trail-test/');
      } finally {
        history.replaceState = originalReplaceState;
        history.pushState(null, '', originalUrl);
      }
    });
  });

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

    it('Returns undefined when pathname is missing', () => {
      const details = getPathDetails({ hash: '#/adobe' });
      expect(details).to.equal(undefined);
    });

    it('Returns undefined when hash is missing', () => {
      const details = getPathDetails({ pathname: '/edit' });
      expect(details).to.equal(undefined);
    });

    it('Strips leading old_hash/access_token segments and uses path that follows', () => {
      const loc = {
        pathname: '/edit',
        hash: '#old_hash=abc#access_token=xyz#/adobe/geometrixx/page',
      };
      const details = getPathDetails(loc);
      expect(details.fullpath).to.equal('/adobe/geometrixx/page.html');
      expect(details.org).to.equal('adobe');
      expect(details.repo).to.equal('geometrixx');
    });
  });

  describe('View detection', () => {
    it('Reports view as edit', () => {
      const loc = { pathname: '/edit', hash: '#/adobe' };
      const details = getPathDetails(loc);
      expect(details.view).to.equal('edit');
    });

    it('Reports view as sheet', () => {
      const loc = { pathname: '/sheet', hash: '#/adobe' };
      const details = getPathDetails(loc);
      expect(details.view).to.equal('sheet');
    });

    it('Reports view as browse for empty pathname', () => {
      const loc = { pathname: '/', hash: '#/adobe' };
      const details = getPathDetails(loc);
      expect(details.view).to.equal('browse');
    });
  });

  describe('Depth metadata', () => {
    it('Org-only path has depth 1', () => {
      const loc = { pathname: '/edit', hash: '#/adobe' };
      const details = getPathDetails(loc);
      expect(details.depth).to.equal(1);
    });

    it('Org+repo path has depth 2', () => {
      const loc = { pathname: '/edit', hash: '#/adobe/geometrixx' };
      const details = getPathDetails(loc);
      expect(details.depth).to.equal(2);
    });

    it('Org+repo+page path has depth 3', () => {
      const loc = { pathname: '/edit', hash: '#/adobe/geometrixx/page' };
      const details = getPathDetails(loc);
      expect(details.depth).to.equal(3);
    });
  });

  describe('Double slashes in hash', () => {
    it('Strips double slashes from fullpath for org+repo+path edit', () => {
      const loc = { pathname: '/edit', hash: '#/adobe/geometrixx//page' };
      const details = getPathDetails(loc);
      expect(details.fullpath).to.not.include('//');
      expect(details.fullpath).to.equal('/adobe/geometrixx/page.html');
    });

    it('Strips double slashes from fullpath for org+repo browse', () => {
      const loc = { pathname: '/', hash: '#/adobe//geometrixx/' };
      const details = getPathDetails(loc);
      expect(details.fullpath).to.not.include('//');
      expect(details.fullpath).to.equal('/adobe/geometrixx/');
    });

    it('Strips double slashes from fullpath for sheet view', () => {
      const loc = { pathname: '/sheet', hash: '#/adobe/geometrixx//page' };
      const details = getPathDetails(loc);
      expect(details.fullpath).to.not.include('//');
      expect(details.fullpath).to.equal('/adobe/geometrixx/page.json');
    });
  });
});
