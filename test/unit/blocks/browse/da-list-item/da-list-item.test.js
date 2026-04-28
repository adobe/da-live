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

    it('does not move when destination already exists', async function test() {
      this.timeout(5000);
      const el = new DaListItem();
      el.name = 'foo';
      el.path = '/org/repo/foo';

      let moveCalled = false;
      const savedFetch = window.fetch;
      window.fetch = (url, opts) => {
        if (opts?.method === 'HEAD') {
          return Promise.resolve(new Response(null, { status: 200 }));
        }
        if (url.includes('/move')) moveCalled = true;
        return Promise.resolve(new Response(null, { status: 204 }));
      };

      const statusCalls = [];
      el.setStatus = (...args) => statusCalls.push(args);
      el.handleChecked = () => {};

      try {
        await el.handleRenameSubmit(makeSubmitEvent({ value: 'bar' }));
      } finally {
        window.fetch = savedFetch;
      }

      expect(moveCalled).to.be.false;
      expect(statusCalls.length).to.be.at.least(1);
      expect(statusCalls[0][0]).to.match(/already exists/i);
    });

    it('Sets an error status when the move call fails', async () => {
      const el = new DaListItem();
      el.name = 'orig';
      el.path = '/org/repo/orig';

      const savedFetch = window.fetch;
      window.fetch = (url) => {
        if (url.includes('/source/')) {
          // HEAD: file does not exist at destination
          return Promise.resolve(new Response(null, { status: 404 }));
        }
        // /move call fails
        return Promise.resolve(new Response('boom', { status: 500 }));
      };
      const statusCalls = [];
      el.setStatus = (...args) => statusCalls.push(args);
      el.updateAEMStatus = () => {};
      el.notifyRenamed = () => {};
      el.handleChecked = () => {};

      try {
        await el.handleRenameSubmit(makeSubmitEvent({ value: 'newname' }));
      } finally {
        window.fetch = savedFetch;
      }

      const errStatus = statusCalls.find((c) => /error/i.test(c[0]));
      expect(errStatus).to.exist;
    });
  });

  describe('handleChecked', () => {
    it('Toggles isChecked and dispatches a checked event with shiftKey', () => {
      const el = new DaListItem();
      el.isChecked = false;
      let detail;
      el.dispatchEvent = (e) => { detail = e.detail; };
      el.handleChecked({ shiftKey: true });
      expect(el.isChecked).to.be.true;
      expect(detail).to.deep.equal({ checked: true, shiftKey: true });
    });

    it('Defaults shiftKey to false when no event is provided', () => {
      const el = new DaListItem();
      el.isChecked = true;
      let detail;
      el.dispatchEvent = (e) => { detail = e.detail; };
      el.handleChecked();
      expect(el.isChecked).to.be.false;
      expect(detail.shiftKey).to.be.false;
    });
  });

  describe('notifyRenamed', () => {
    it('Dispatches a renamecompleted event with the new and old paths', () => {
      const el = new DaListItem();
      el.name = 'newname';
      el.path = '/org/repo/newname';
      el.date = 12345;
      let received;
      el.dispatchEvent = (e) => { received = e; };
      el.notifyRenamed('/org/repo/oldname');
      expect(received.type).to.equal('renamecompleted');
      expect(received.detail).to.deep.equal({
        path: '/org/repo/newname',
        name: 'newname',
        date: 12345,
        oldPath: '/org/repo/oldname',
      });
    });
  });

  describe('setStatus', () => {
    it('Dispatches an onstatus event', () => {
      const el = new DaListItem();
      let detail;
      el.dispatchEvent = (e) => { detail = e.detail; };
      el.setStatus('Hi', 'desc', 'info');
      expect(detail).to.deep.equal({ text: 'Hi', description: 'desc', type: 'info' });
    });
  });

  describe('doesFileExist', () => {
    let savedFetch;
    beforeEach(() => { savedFetch = window.fetch; });
    afterEach(() => { window.fetch = savedFetch; });

    it('Returns true when source HEAD returns 200', async () => {
      window.fetch = () => Promise.resolve(new Response(null, { status: 200 }));
      const el = new DaListItem();
      expect(await el.doesFileExist('/org/repo/x')).to.be.true;
    });

    it('Returns false for non-200 responses', async () => {
      window.fetch = () => Promise.resolve(new Response(null, { status: 404 }));
      const el = new DaListItem();
      expect(await el.doesFileExist('/org/repo/x')).to.be.false;
    });
  });

  describe('updateAEMStatus', () => {
    let savedFetch;
    beforeEach(() => { savedFetch = window.fetch; });
    afterEach(() => { window.fetch = savedFetch; });

    it('Maps a successful AEM status response to _preview/_live', async () => {
      window.fetch = () => Promise.resolve(new Response(
        JSON.stringify({
          preview: { status: 200, url: 'p', lastModified: '2024-01-01T00:00:00Z' },
          live: { status: 200, url: 'l', lastModified: null },
        }),
        { status: 200 },
      ));
      const el = new DaListItem();
      el.path = '/org/repo/page.html';
      await el.updateAEMStatus();
      expect(el._preview.status).to.equal(200);
      expect(el._preview.lastModified).to.exist;
      expect(el._live.status).to.equal(200);
      expect(el._live.lastModified).to.equal(null);
    });

    it('Falls back to 401 when AEM admin returns nothing', async () => {
      window.fetch = () => Promise.resolve(new Response('', { status: 500 }));
      const el = new DaListItem();
      el.path = '/org/repo/page.html';
      await el.updateAEMStatus();
      expect(el._preview).to.deep.equal({ status: 401 });
      expect(el._live).to.deep.equal({ status: 401 });
    });
  });

  describe('updateDAStatus', () => {
    let savedFetch;
    beforeEach(() => { savedFetch = window.fetch; });
    afterEach(() => { window.fetch = savedFetch; });

    it('Sets version to 0 and anonymous when the version list is empty', async () => {
      window.fetch = () => Promise.resolve(new Response('[]', { status: 200 }));
      const el = new DaListItem();
      el.path = '/org/repo/page';
      await el.updateDAStatus();
      expect(el._version).to.equal(0);
      expect(el._lastModifedBy).to.equal('anonymous');
    });

    it('Counts versionsource entries and lowercases the modifier emails', async () => {
      const list = [
        { timestamp: 2, url: '/versionsource/x', users: [{ email: 'Joe@example.com' }] },
        { timestamp: 1, url: '/other/y', users: [{ email: 'X' }] },
        { timestamp: 3, url: '/versionsource/y', users: [{ email: 'JANE@example.com' }, { email: 'JIM@example.com' }] },
      ];
      window.fetch = () => Promise.resolve(new Response(JSON.stringify(list), { status: 200 }));
      const el = new DaListItem();
      el.path = '/org/repo/page';
      await el.updateDAStatus();
      expect(el._version).to.equal(2);
      expect(el._lastModifedBy).to.equal('jane, jim');
    });

    it('Returns early when version list fetch fails', async () => {
      window.fetch = () => Promise.resolve(new Response('boom', { status: 500 }));
      const el = new DaListItem();
      el.path = '/org/repo/page';
      el._version = 99;
      await el.updateDAStatus();
      expect(el._version).to.equal(99);
    });
  });

  describe('toggleExpand', () => {
    it('Adds is-expanded and triggers status updates', () => {
      const el = new DaListItem();
      el.classList.toggle('is-expanded', false);
      let aem = false;
      let da = false;
      el.updateAEMStatus = () => { aem = true; };
      el.updateDAStatus = () => { da = true; };
      el.toggleExpand();
      expect(el.classList.contains('is-expanded')).to.be.true;
      expect(aem).to.be.true;
      expect(da).to.be.true;
    });

    it('Clears state when collapsing', () => {
      const el = new DaListItem();
      el.classList.add('is-expanded');
      el._preview = { status: 200 };
      el._live = { status: 200 };
      el._version = 5;
      el._lastModifedBy = 'alice';
      el.toggleExpand();
      expect(el.classList.contains('is-expanded')).to.be.false;
      expect(el._preview).to.equal(null);
      expect(el._live).to.equal(null);
      expect(el._version).to.equal(null);
      expect(el._lastModifedBy).to.equal(null);
    });
  });

  describe('renderAemDate', () => {
    it('Returns "Checking" when env property is absent', () => {
      const el = new DaListItem();
      expect(el.renderAemDate('_preview')).to.equal('Checking');
    });

    it('Returns "Never" when lastModified is null', () => {
      const el = new DaListItem();
      el._preview = { status: 200 };
      expect(el.renderAemDate('_preview')).to.equal('Never');
    });

    it('Returns formatted date+time when lastModified is set', () => {
      const el = new DaListItem();
      el._preview = { status: 200, lastModified: { date: '2024-01-01', time: '12:00' } };
      expect(el.renderAemDate('_preview')).to.equal('2024-01-01 12:00');
    });
  });

  describe('renderDate', () => {
    it('Returns nothing when no date is set', () => {
      const el = new DaListItem();
      expect(el.renderDate()).to.not.equal(undefined);
    });

    it('Formats a numeric timestamp to date and time', () => {
      const el = new DaListItem();
      // 2024-01-01T00:00:00Z
      el.date = 1704067200000;
      const result = el.renderDate();
      expect(result).to.match(/\d/);
    });
  });
});
