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
});
