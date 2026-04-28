/* eslint-disable no-underscore-dangle, max-statements-per-line, max-len */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

describe('DaListItem', () => {
  let DaListItem;

  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    const mod = await import('../../../../../blocks/browse/da-list-item/da-list-item.js');
    DaListItem = mod.default;
  });

  describe('handleRename', () => {
    it('lowercases and replaces invalid chars with hyphens', () => {
      const el = new DaListItem();
      const target = { value: 'Foo Bar' };
      el.handleRename({ target });
      expect(target.value).to.equal('foo-bar');
    });

    it('collapses consecutive invalid chars into a single hyphen', () => {
      const el = new DaListItem();
      const target = { value: 'foo!!bar' };
      el.handleRename({ target });
      expect(target.value).to.equal('foo-bar');
    });

    it('collapses an invalid char typed right after an existing hyphen', () => {
      const el = new DaListItem();
      const target = { value: 'foo-!' };
      el.handleRename({ target });
      expect(target.value).to.equal('foo-');
    });

    it('preserves a single trailing hyphen during typing', () => {
      const el = new DaListItem();
      const target = { value: 'foo!' };
      el.handleRename({ target });
      expect(target.value).to.equal('foo-');
    });

    it('preserves a valid hyphen between alphanumeric chars', () => {
      const el = new DaListItem();
      const target = { value: 'foo-bar' };
      el.handleRename({ target });
      expect(target.value).to.equal('foo-bar');
    });
  });

  describe('handleRenameSubmit', () => {
    function makeSubmitEvent({ value, submitterValue = 'confirm' }) {
      return {
        preventDefault: () => {},
        submitter: { value: submitterValue },
        target: { elements: { 'new-name': { value } } },
      };
    }

    it('strips trailing hyphen from the submitted name before renaming', async () => {
      const el = new DaListItem();
      el.name = 'original';
      el.path = '/org/repo/folder/original';
      el.ext = '';

      const fetched = [];
      const savedFetch = window.fetch;
      window.fetch = (url, opts) => {
        fetched.push({ url, opts });
        // 204 signals a successful move.
        return Promise.resolve(new Response(null, { status: 204 }));
      };
      el.setStatus = () => {};
      el.updateAEMStatus = () => {};
      el.notifyRenamed = () => {};
      el.handleChecked = () => {};

      try {
        await el.handleRenameSubmit(makeSubmitEvent({ value: 'renamed-' }));
      } finally {
        window.fetch = savedFetch;
      }

      expect(el.name).to.equal('renamed');
      expect(el.path).to.equal('/org/repo/folder/renamed');

      const moveCall = fetched.find(({ url }) => url.includes('/move'));
      expect(moveCall, 'expected a call to the move endpoint').to.exist;
      expect(moveCall.opts.body.get('destination')).to.equal('/org/repo/folder/renamed');
    });

    it('treats a submission that sanitizes to the original name as a no-op', async () => {
      const el = new DaListItem();
      el.name = 'foo';
      el.path = '/org/repo/foo';
      el.ext = '';

      let fetchCalled = false;
      const savedFetch = window.fetch;
      window.fetch = () => { fetchCalled = true; return Promise.resolve(new Response(null, { status: 204 })); };

      let checkedCalled = false;
      el.handleChecked = () => { checkedCalled = true; };
      el.setStatus = () => {};

      try {
        // "foo-" trims to "foo", which matches this.name — should not move.
        await el.handleRenameSubmit(makeSubmitEvent({ value: 'foo-' }));
      } finally {
        window.fetch = savedFetch;
      }

      expect(fetchCalled).to.be.false;
      expect(checkedCalled).to.be.true;
    });

    it('shows a status message and skips renaming when the name becomes empty', async function test() {
      // handleRenameSubmit waits 2s via delay() before clearing the status,
      // so we need more than mocha's 2s default test timeout.
      this.timeout(5000);
      const el = new DaListItem();
      el.name = 'original';
      el.path = '/org/repo/original';
      el.ext = '';

      let fetchCalled = false;
      const savedFetch = window.fetch;
      window.fetch = () => { fetchCalled = true; return Promise.resolve(new Response(null, { status: 204 })); };

      const statusCalls = [];
      el.setStatus = (...args) => statusCalls.push(args);
      el.handleChecked = () => {};

      try {
        // All hyphens -> trims to empty string.
        await el.handleRenameSubmit(makeSubmitEvent({ value: '---' }));
      } finally {
        window.fetch = savedFetch;
      }

      expect(fetchCalled).to.be.false;
      // The first setStatus call surfaces the error to the user.
      expect(statusCalls.length).to.be.at.least(1);
      expect(statusCalls[0][0]).to.match(/name is required/i);
    });

    it('cancels without renaming when submitter value is cancel', async () => {
      const el = new DaListItem();
      el.name = 'foo';
      el.path = '/org/repo/foo';

      let fetchCalled = false;
      const savedFetch = window.fetch;
      window.fetch = () => { fetchCalled = true; return Promise.resolve(new Response(null, { status: 204 })); };

      let checkedCalled = false;
      el.handleChecked = () => { checkedCalled = true; };
      el.setStatus = () => {};

      try {
        await el.handleRenameSubmit(makeSubmitEvent({ value: 'anything', submitterValue: 'cancel' }));
      } finally {
        window.fetch = savedFetch;
      }

      expect(fetchCalled).to.be.false;
      expect(checkedCalled).to.be.true;
    });
  });

  describe('updateAEMStatus', () => {
    let savedFetch;
    let savedIms;

    beforeEach(() => {
      savedFetch = window.fetch;
      savedIms = window.localStorage.getItem('nx-ims');
      window.localStorage.removeItem('nx-ims');
    });

    afterEach(() => {
      window.fetch = savedFetch;
      if (savedIms) window.localStorage.setItem('nx-ims', savedIms);
    });

    it('stores the live redirectLocation on both _preview and _live', async () => {
      const json = {
        preview: { status: 200, url: 'https://preview.example.com/page', lastModified: 1700000000000 },
        live: { status: 200, url: 'https://live.example.com/page', lastModified: 1700000000000, redirectLocation: '/redirected' },
      };
      window.fetch = () => Promise.resolve(new Response(JSON.stringify(json), { status: 200 }));

      const el = new DaListItem();
      el.path = '/org/repo/folder/page';
      await el.updateAEMStatus();

      expect(el._preview.redirect).to.equal('/redirected');
      expect(el._live.redirect).to.equal('/redirected');
      expect(el._preview.status).to.equal(200);
      expect(el._live.status).to.equal(200);
      expect(el._preview.url).to.equal('https://preview.example.com/page');
      expect(el._live.url).to.equal('https://live.example.com/page');
    });

    it('leaves redirect undefined when the live response has no redirectLocation', async () => {
      const json = {
        preview: { status: 200, url: 'https://preview.example.com/page', lastModified: null },
        live: { status: 200, url: 'https://live.example.com/page', lastModified: null },
      };
      window.fetch = () => Promise.resolve(new Response(JSON.stringify(json), { status: 200 }));

      const el = new DaListItem();
      el.path = '/org/repo/folder/page';
      await el.updateAEMStatus();

      expect(el._preview.redirect).to.equal(undefined);
      expect(el._live.redirect).to.equal(undefined);
    });

    it('falls back to status 401 on _preview and _live when aemAdmin returns undefined', async () => {
      window.fetch = () => Promise.resolve(new Response(null, { status: 500 }));

      const el = new DaListItem();
      el.path = '/org/repo/folder/page';
      await el.updateAEMStatus();

      expect(el._preview).to.deep.equal({ status: 401 });
      expect(el._live).to.deep.equal({ status: 401 });
    });
  });

  describe('renderAemDate', () => {
    it('returns "Checking" when the env state is not yet populated', () => {
      const el = new DaListItem();
      expect(el.renderAemDate('_preview')).to.equal('Checking');
      expect(el.renderAemDate('_live')).to.equal('Checking');
    });

    it('returns "Not previewed" for _preview without lastModified', () => {
      const el = new DaListItem();
      el._preview = { status: 200, url: 'x', lastModified: null };
      expect(el.renderAemDate('_preview')).to.equal('Not previewed');
    });

    it('returns "Not published" for _live without lastModified', () => {
      const el = new DaListItem();
      el._live = { status: 200, url: 'x', lastModified: null };
      expect(el.renderAemDate('_live')).to.equal('Not published');
    });

    it('returns the formatted date+time when lastModified is set', () => {
      const el = new DaListItem();
      el._preview = { status: 200, url: 'x', lastModified: { date: 'Jan 1, 2026', time: '12:00 PM' } };
      expect(el.renderAemDate('_preview')).to.equal('Jan 1, 2026 12:00 PM');
    });
  });

  describe('render', () => {
    let el;

    afterEach(() => {
      if (el?.isConnected) el.remove();
    });

    it('uses redirect titles and redirect hrefs when _live.redirect is set', async () => {
      el = document.createElement('da-list-item');
      el.ext = 'html';
      el.editor = '/edit#';
      el.path = '/org/repo/folder/page.html';
      el.name = 'page';
      document.body.appendChild(el);
      await el.updateComplete;

      el._preview = { status: 200, url: 'https://preview.example.com/page', lastModified: null, redirect: '/redirected' };
      el._live = { status: 200, url: 'https://live.example.com/page', lastModified: null, redirect: '/redirected' };
      await el.updateComplete;

      const titles = [...el.shadowRoot.querySelectorAll('.da-aem-icon-details .da-list-item-details-title')]
        .map((t) => t.textContent);
      expect(titles).to.deep.equal(['Preview Redirect', 'Publish Redirect']);

      const anchors = el.shadowRoot.querySelectorAll('a.da-item-list-item-aem-btn');
      expect(anchors[0].getAttribute('href')).to.equal('/redirected');
      expect(anchors[1].getAttribute('href')).to.equal('/redirected');
    });

    it('uses default titles and url hrefs when redirect is absent', async () => {
      el = document.createElement('da-list-item');
      el.ext = 'html';
      el.editor = '/edit#';
      el.path = '/org/repo/folder/page.html';
      el.name = 'page';
      document.body.appendChild(el);
      await el.updateComplete;

      el._preview = { status: 200, url: 'https://preview.example.com/page', lastModified: null };
      el._live = { status: 200, url: 'https://live.example.com/page', lastModified: null };
      await el.updateComplete;

      const titles = [...el.shadowRoot.querySelectorAll('.da-aem-icon-details .da-list-item-details-title')]
        .map((t) => t.textContent);
      expect(titles).to.deep.equal(['Previewed', 'Published']);

      const anchors = el.shadowRoot.querySelectorAll('a.da-item-list-item-aem-btn');
      expect(anchors[0].getAttribute('href')).to.equal('https://preview.example.com/page');
      expect(anchors[1].getAttribute('href')).to.equal('https://live.example.com/page');
    });
  });
});
