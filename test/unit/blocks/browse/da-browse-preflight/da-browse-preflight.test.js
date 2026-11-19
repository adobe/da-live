/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: DaBrowsePreflight } = await import('../../../../../blocks/browse/da-browse-preflight/da-browse-preflight.js');

describe('DaBrowsePreflight', () => {
  let savedFetch;
  let savedNxIms;
  let el;
  let testIndex = 0;

  beforeEach(() => {
    savedFetch = window.fetch;
    savedNxIms = localStorage.getItem('nx-ims');
    testIndex += 1;
  });

  afterEach(() => {
    el?.remove();
    el = null;
    window.fetch = savedFetch;
    if (savedNxIms === null) localStorage.removeItem('nx-ims');
    else localStorage.setItem('nx-ims', savedNxIms);
  });

  function mount(items) {
    el = new DaBrowsePreflight();
    el.items = items;
    el.canPublish = true;
    document.body.append(el);
    return el;
  }

  describe('_pageUrl', () => {
    it('uses the branch from the ew.wysiwygBranch config', async () => {
      const org = `org-bp-${testIndex}`;
      const site = `site-bp-${testIndex}`;
      const body = JSON.stringify({ data: [{ key: 'ew.wysiwygBranch', value: `/${org}/${site}/news=feature` }] });
      window.fetch = () => Promise.resolve(new Response(body, { status: 200 }));
      const url = await new DaBrowsePreflight()._pageUrl({ path: `/${org}/${site}/news/a.html` });
      expect(url).to.match(new RegExp(`^https://feature--${site}--${org}\\.[a-z-]*preview\\.da\\.live/news/a$`));
    });

    it('falls back to main when the branch cannot be resolved', async () => {
      const org = `org-bp-${testIndex}`;
      const site = `site-bp-${testIndex}`;
      window.fetch = () => Promise.reject(new Error('offline'));
      const url = await new DaBrowsePreflight()._pageUrl({ path: `/${org}/${site}/a.html` });
      expect(url).to.match(new RegExp(`^https://main--${site}--${org}\\.`));
    });
  });

  describe('rows', () => {
    it('marks non-page files not applicable without evaluating and offers them in Publish Passing', async () => {
      let calls = 0;
      window.fetch = () => {
        calls += 1;
        return Promise.resolve(new Response('{}'));
      };
      const json = { path: '/o/s/data.json', ext: 'json' };
      const img = { path: '/o/s/pic.png', ext: 'png' };
      mount([json, img]);
      await el.updateComplete;
      expect(el._rows.map((r) => r.status)).to.deep.equal(['pass', 'pass']);
      expect(el._passing).to.deep.equal([json, img]);
      expect(calls).to.equal(0);
      const icons = [...el.shadowRoot.querySelectorAll('.da-preflight-row-actions .ui-artifact-pe-icon')];
      expect(icons.map((i) => i.getAttribute('aria-label'))).to.deep.equal(['Not applicable', 'Not applicable']);
      expect(icons.every((i) => i.classList.contains('ui-artifact-pe-tone-neutral'))).to.be.true;
      const [cancel, publish] = el.shadowRoot.querySelectorAll('.da-preflight-footer button');
      expect(cancel.className).to.equal('nx-form-btn-secondary');
      expect(cancel.textContent.trim()).to.equal('Cancel');
      expect(publish.className).to.equal('nx-form-btn-primary');
      expect(publish.textContent.trim()).to.equal('Publish Passing (2)');
    });

    it('checks auth once and marks every page as an error when signed out', async () => {
      localStorage.removeItem('nx-ims');
      let calls = 0;
      window.fetch = () => {
        calls += 1;
        return Promise.resolve(new Response('{}'));
      };
      const page = { path: '/o/s/a.html', ext: 'html' };
      const json = { path: '/o/s/data.json', ext: 'json' };
      mount([page, { path: '/o/s/b.html', ext: 'html' }, json]);
      await el._evaluateAll();
      await el.updateComplete;
      expect(el._authError).to.be.a('string');
      expect(el._rows.map((r) => r.status)).to.deep.equal(['error', 'error', 'pass']);
      expect(el._passing).to.deep.equal([json]);
      expect(calls).to.equal(0);
      expect(el.shadowRoot.querySelectorAll('da-dialog > .da-preflight-error')).to.have.length(1);
    });

    it('labels rows like browse: name without extension, site-relative path in tooltip', async () => {
      localStorage.removeItem('nx-ims');
      mount([
        { path: '/o/s/blog/post.html', ext: 'html', name: 'post' },
        { path: '/o/s/data.json', ext: 'json' },
      ]);
      await el.updateComplete;
      const labels = [...el.shadowRoot.querySelectorAll('.da-preflight-path')];
      expect(labels.map((l) => l.textContent)).to.deep.equal(['post', 'data']);
      expect(labels.map((l) => l.title)).to.deep.equal(['/blog/post', '/data.json']);
      const icons = [...el.shadowRoot.querySelectorAll('.da-preflight-type use')];
      expect(icons[0].getAttribute('href')).to.contain('filehtml');
    });

    it('shows a spinner in the status slot while a page is evaluating', async () => {
      el = new DaBrowsePreflight();
      el.items = [{ path: '/o/s/a.html', ext: 'html', name: 'a' }];
      el._evaluateAll = () => {};
      document.body.append(el);
      await el.updateComplete;
      const spinner = el.shadowRoot.querySelector('.da-preflight-row-actions .nx-loading-spinner');
      expect(spinner).to.exist;
      expect(spinner.getAttribute('role')).to.equal('status');
      expect(el.shadowRoot.querySelector('.ui-artifact-pe-icon')).to.not.exist;
    });
  });
});
