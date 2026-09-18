/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../../scripts/utils.js';
import { REASONS } from '../../../../../../../blocks/edit/da-prepare/actions/preflight/utils/constants.js';

const wait = (ms = 50) => new Promise((resolve) => { setTimeout(resolve, ms); });

let savedFetch;
let render;
let loadDoc;
let loadResults;
let fragmentCheck;
let groupChecksByCategory;

// Set up fetch mock and nx before any component imports
before(async () => {
  savedFetch = window.fetch;
  window.fetch = async (url) => {
    if (url.endsWith('.css')) {
      return new Response('', { status: 200, headers: { 'Content-Type': 'text/css' } });
    }
    if (url.endsWith('.svg')) {
      return new Response('<svg xmlns="http://www.w3.org/2000/svg"><symbol id="test"/></svg>', {
        status: 200,
        headers: { 'Content-Type': 'image/svg+xml' },
      });
    }
    return new Response('{}', { status: 200 });
  };

  setNx('/test/fixtures/nx', { hostname: 'example.com' });

  const ootbMod = await import(
    '../../../../../../../blocks/edit/da-prepare/actions/preflight/providers/ootb.js'
  );
  loadDoc = ootbMod.loadDoc;
  loadResults = ootbMod.loadResults;
  fragmentCheck = ootbMod.fragmentCheck;

  const preflightMod = await import(
    '../../../../../../../blocks/edit/da-prepare/actions/preflight/preflight.js'
  );
  render = preflightMod.default;
  groupChecksByCategory = preflightMod.groupChecksByCategory;
});

after(() => {
  window.fetch = savedFetch;
});

describe('Preflight utils', () => {
  describe('constants', () => {
    it('has expected reason keys', () => {
      expect(REASONS['h1.info']).to.have.property('status', 'info');
      expect(REASONS['h1.warn']).to.have.property('status', 'warn');
      expect(REASONS['h1.error']).to.have.property('status', 'error');
      expect(REASONS['lorem.info']).to.have.property('status', 'info');
      expect(REASONS['lorem.error']).to.have.property('status', 'error');
    });
  });

  describe('loadDoc', () => {
    it('returns parsed document on success', async () => {
      const prevFetch = window.fetch;
      window.fetch = async (url) => {
        if (url.includes('/source/')) {
          return new Response('<html><body><h1>Test</h1></body></html>', { status: 200 });
        }
        return prevFetch(url);
      };

      const result = await loadDoc({ fullpath: '/org/site/test/page' });

      expect(result.doc).to.exist;
      expect(result.doc.querySelector('h1').textContent).to.equal('Test');
      expect(result.error).to.be.undefined;

      window.fetch = prevFetch;
    });

    it('returns error on failed fetch', async () => {
      const prevFetch = window.fetch;
      window.fetch = async (url) => {
        if (url.includes('/source/')) {
          return new Response('', { status: 404 });
        }
        return prevFetch(url);
      };

      const result = await loadDoc({ fullpath: '/org/site/missing' });

      expect(result.error).to.be.a('string');
      expect(result.error).to.include('404');
      expect(result.doc).to.be.undefined;

      window.fetch = prevFetch;
    });
  });

  describe('loadResults', () => {
    it('returns a flat list of checks tagged with their category', () => {
      const doc = new DOMParser().parseFromString('<html><body><h1>Test</h1></body></html>', 'text/html');
      const checks = loadResults(doc, () => {});

      expect(checks).to.be.an('array');
      checks.forEach((check) => {
        expect(check).to.have.property('category');
        expect(check).to.have.property('title');
        expect(check).to.have.property('results').that.is.an('array');
      });
    });

    it('populates results asynchronously and calls requestUpdate', async () => {
      const doc = new DOMParser().parseFromString('<html><body><h1>Test</h1><p>Description</p></body></html>', 'text/html');
      let updateCount = 0;
      const requestUpdate = () => { updateCount += 1; };

      const checks = loadResults(doc, requestUpdate);
      await wait(100);

      const withResults = checks.filter((check) => check.results.length > 0);
      expect(withResults.length).to.be.greaterThan(0);
      expect(updateCount).to.be.greaterThan(0);
    });

    it('Content category has H1 count and Lorem ipsum checks', () => {
      const doc = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
      const checks = loadResults(doc, () => {});

      const titles = checks.filter((c) => c.category === 'Content').map((c) => c.title);
      expect(titles).to.include('H1 count');
      expect(titles).to.include('Lorem ipsum');
    });

    it('SEO category has Title and Description checks', () => {
      const doc = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
      const checks = loadResults(doc, () => {});

      const titles = checks.filter((c) => c.category === 'SEO').map((c) => c.title);
      expect(titles).to.include('Title');
      expect(titles).to.include('Description');
    });

    it('References category has Fragments check', () => {
      const doc = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
      const checks = loadResults(doc, () => {});

      const titles = checks.filter((c) => c.category === 'References').map((c) => c.title);
      expect(titles).to.include('Fragments');
    });
  });

  describe('check functions via loadResults', () => {
    it('h1 check returns info when exactly one H1', async () => {
      const html = '<html><body><h1>Title</h1></body></html>';
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const checks = loadResults(doc, () => {});
      await wait(100);

      const h1Check = checks.find((c) => c.title === 'H1 count');
      expect(h1Check.results[0]).to.deep.equal(REASONS['h1.info']);
    });

    it('h1 check returns warn when multiple H1s', async () => {
      const html = '<html><body><h1>First</h1><h1>Second</h1></body></html>';
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const checks = loadResults(doc, () => {});
      await wait(100);

      const h1Check = checks.find((c) => c.title === 'H1 count');
      expect(h1Check.results[0]).to.deep.equal(REASONS['h1.warn']);
    });

    it('h1 check returns error when no H1', async () => {
      const html = '<html><body><p>No heading</p></body></html>';
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const checks = loadResults(doc, () => {});
      await wait(100);

      const h1Check = checks.find((c) => c.title === 'H1 count');
      expect(h1Check.results[0]).to.deep.equal(REASONS['h1.error']);
    });

    it('lorem check returns error when lorem ipsum found', async () => {
      const html = '<html><body><p>Lorem ipsum dolor sit amet</p></body></html>';
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const checks = loadResults(doc, () => {});
      await wait(100);

      const loremCheck = checks.find((c) => c.title === 'Lorem ipsum');
      expect(loremCheck.results[0]).to.deep.equal(REASONS['lorem.error']);
    });

    it('lorem check returns info when no lorem ipsum', async () => {
      const html = '<html><body><p>Clean content</p></body></html>';
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const checks = loadResults(doc, () => {});
      await wait(100);

      const loremCheck = checks.find((c) => c.title === 'Lorem ipsum');
      expect(loremCheck.results[0]).to.deep.equal(REASONS['lorem.info']);
    });

    it('title check returns info when metadata title exists', async () => {
      const html = '<html><body><div class="metadata"><div><div>Title</div><div>My Title</div></div></div></body></html>';
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const checks = loadResults(doc, () => {});
      await wait(100);

      const titleCheck = checks.find((c) => c.title === 'Title');
      expect(titleCheck.results[0]).to.deep.equal(REASONS['title.info.meta']);
    });

    it('title check returns info.h1 when no metadata but H1 exists', async () => {
      const html = '<html><body><h1>Heading</h1></body></html>';
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const checks = loadResults(doc, () => {});
      await wait(100);

      const titleCheck = checks.find((c) => c.title === 'Title');
      expect(titleCheck.results[0]).to.deep.equal(REASONS['title.info.h1']);
    });

    it('title check returns error when no title or H1', async () => {
      const html = '<html><body><p>No title here</p></body></html>';
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const checks = loadResults(doc, () => {});
      await wait(100);

      const titleCheck = checks.find((c) => c.title === 'Title');
      expect(titleCheck.results[0]).to.deep.equal(REASONS['title.error']);
    });

    it('description check returns info when metadata description exists', async () => {
      const html = '<html><body><div class="metadata"><div><div>Description</div><div>My desc</div></div></div></body></html>';
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const checks = loadResults(doc, () => {});
      await wait(100);

      const descCheck = checks.find((c) => c.title === 'Description');
      expect(descCheck.results[0]).to.deep.equal(REASONS['description.info.meta']);
    });

    it('description check returns info.para when first paragraph exists', async () => {
      const html = '<html><body><p>First paragraph</p></body></html>';
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const checks = loadResults(doc, () => {});
      await wait(100);

      const descCheck = checks.find((c) => c.title === 'Description');
      expect(descCheck.results[0]).to.deep.equal(REASONS['description.info.para']);
    });

    it('description check returns warn when no description source', async () => {
      const html = '<html><body><h1>Only heading</h1></body></html>';
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const checks = loadResults(doc, () => {});
      await wait(100);

      const descCheck = checks.find((c) => c.title === 'Description');
      expect(descCheck.results[0]).to.deep.equal(REASONS['description.warn']);
    });
  });

  describe('fragmentCheck', () => {
    it('returns pf-link elements for each link in doc', async () => {
      const html = '<html><body><a href="/fragments/page1">Link 1</a><a href="/fragments/page2">Link 2</a></body></html>';
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const details = { org: 'testorg', site: 'testsite' };

      const results = await fragmentCheck({ details, doc });

      expect(results.length).to.equal(2);
      results.forEach((result) => {
        expect(result).to.be.instanceOf(HTMLElement);
        expect(result.tagName.toLowerCase()).to.equal('pf-link');
      });
    });

    it('passes text and href to pf-link components', async () => {
      const html = '<html><body><a href="/fragments/my-page">My Page</a></body></html>';
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const details = { org: 'testorg', site: 'testsite' };

      const results = await fragmentCheck({ details, doc });

      expect(results[0].text).to.equal('My Page');
      expect(results[0].href).to.equal('/fragments/my-page');
      expect(results[0].details).to.equal(details);
    });

    it('returns empty array when no links in doc', async () => {
      const html = '<html><body><p>No links here</p></body></html>';
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const details = { org: 'testorg', site: 'testsite' };

      const results = await fragmentCheck({ details, doc });

      expect(results).to.deep.equal([]);
    });
  });
});

describe('Preflight component', () => {
  describe('render export', () => {
    it('returns a da-preflight element with details set', () => {
      const details = { fullpath: '/org/site/page', org: 'org', site: 'site' };
      const cmp = render(details);

      expect(cmp.tagName.toLowerCase()).to.equal('da-preflight');
      expect(cmp.details).to.equal(details);
    });
  });

  describe('DaPreflight', () => {
    it('is defined as a custom element', () => {
      expect(customElements.get('da-preflight')).to.exist;
    });

    it('expandCategory toggles open state, keyed by category title', () => {
      const el = document.createElement('da-preflight');
      const cat = { title: 'Test', checks: [] };

      el.expandCategory(cat);
      expect(el._openCategories.get('Test')).to.be.true;

      el.expandCategory(cat);
      expect(el._openCategories.get('Test')).to.be.false;
    });

    it('aborts each provider controller on disconnect', async () => {
      const el = document.createElement('da-preflight');
      el.details = { fullpath: '/org/site/page', org: 'org', site: 'site' };
      document.body.append(el);
      await new Promise((resolve) => { setTimeout(resolve, 20); });

      const [controller] = el._providerControllers;
      expect(controller.signal.aborted).to.be.false;

      el.remove();
      expect(controller.signal.aborted).to.be.true;
    });
  });

  describe('groupChecksByCategory', () => {
    it('groups checks under their category, in first-seen order', () => {
      const checks = [
        { category: 'B', title: 'b1', results: [] },
        { category: 'A', title: 'a1', results: [] },
        { category: 'B', title: 'b2', results: [] },
      ];

      const categories = groupChecksByCategory(checks);

      expect(categories.map((c) => c.title)).to.deep.equal(['B', 'A']);
      const catB = categories.find((c) => c.title === 'B');
      expect(catB.checks.map((c) => c.title)).to.deep.equal(['b1', 'b2']);
    });

    it('merges checks from multiple providers sharing a category', () => {
      const checks = [
        { category: 'Content', title: 'from-provider-a', results: [] },
        { category: 'Content', title: 'from-provider-b', results: [] },
      ];

      const categories = groupChecksByCategory(checks);

      expect(categories.length).to.equal(1);
      expect(categories[0].checks.map((c) => c.title)).to.deep.equal(['from-provider-a', 'from-provider-b']);
    });
  });
});
