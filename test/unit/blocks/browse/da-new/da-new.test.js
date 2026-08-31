/* eslint-disable no-underscore-dangle, max-len */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

describe('DaNew', () => {
  let DaNew;

  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    const mod = await import('../../../../../blocks/browse/da-new/da-new.js');
    DaNew = mod.default;
  });

  // Name validation/sanitization is covered by da-name-dialog's own test suite —
  // _handleCreate only ever receives an already-valid, sanitized name via the
  // da-name-submit event's detail.
  describe('_handleCreate', () => {
    it('closes the dialog immediately before async work (document type)', async () => {
      const el = new DaNew();
      el._createType = 'document';
      el.fullpath = '/org/repo';
      el.editor = '';
      el._createDialogOpen = true;

      const savedFetch = window.fetch;
      const NAV_SENTINEL = new Error('stop-before-nav');
      window.fetch = async (url) => {
        if (String(url).includes('/ping/')) return new Response('', { status: 200 });
        throw NAV_SENTINEL;
      };

      let caught;
      try {
        await el._handleCreate({ detail: { name: 'my-doc' } });
      } catch (e) {
        caught = e;
      } finally {
        window.fetch = savedFetch;
      }

      expect(caught).to.equal(NAV_SENTINEL);
      expect(el._createDialogOpen).to.be.false;
    });

    it('creates an empty HTML document via source.save before navigating (document type)', async () => {
      const el = new DaNew();
      el._createType = 'document';
      el.fullpath = '/org/repo';
      el.editor = '/edit#';

      const fetchCalls = [];
      const savedFetch = window.fetch;
      const NAV_SENTINEL = new Error('stop-before-nav');
      window.fetch = async (url, opts) => {
        if (String(url).includes('/ping/')) return new Response('', { status: 200 });
        const body = opts?.body instanceof FormData ? opts.body.get('data') : opts?.body;
        const bodyText = body && typeof body.text === 'function' ? await body.text() : body;
        fetchCalls.push({ url, method: opts?.method, bodyText });
        throw NAV_SENTINEL;
      };

      try {
        await el._handleCreate({ detail: { name: 'my-doc' } });
      } catch (e) {
        // expected NAV_SENTINEL
      } finally {
        window.fetch = savedFetch;
      }

      expect(fetchCalls).to.have.length(1);
      expect(fetchCalls[0].url).to.equal('https://admin.da.live/source/org/repo/my-doc.html');
      expect(fetchCalls[0].method).to.equal('POST');
      expect(fetchCalls[0].bodyText).to.equal(
        '<body><header></header><main><div></div></main><footer></footer></body>',
      );
    });

    it('POSTs to the trailing-slash folder URL via source.createFolder', async () => {
      const el = new DaNew();
      el._createType = 'folder';
      el.fullpath = '/org/repo';

      const fetchCalls = [];
      const savedFetch = window.fetch;
      window.fetch = async (url, opts) => {
        fetchCalls.push({ url: String(url), method: opts?.method });
        return new Response('ok', { status: 200 });
      };

      const sendEvents = [];
      el.sendNewItem = (item) => sendEvents.push(item);

      try {
        await el._handleCreate({ detail: { name: 'my-folder' } });
      } finally {
        window.fetch = savedFetch;
      }

      expect(fetchCalls).to.have.length(1);
      // createFolder appends a trailing slash to signal directory creation
      expect(fetchCalls[0].url).to.equal('https://admin.da.live/source/org/repo/my-folder/');
      expect(fetchCalls[0].method).to.equal('POST');
      expect(sendEvents[0].name).to.equal('my-folder');
      expect(sendEvents[0].path).to.equal('/org/repo/my-folder');
    });

    it('saves an empty sheet JSON via source.save before navigating (sheet type)', async () => {
      const el = new DaNew();
      el._createType = 'sheet';
      el.fullpath = '/org/repo';
      el.editor = '';

      const fetchCalls = [];
      const savedFetch = window.fetch;
      const NAV_SENTINEL = new Error('stop-before-nav');
      window.fetch = async (url, opts) => {
        if (String(url).includes('/ping/')) return new Response('', { status: 200 });
        const body = opts?.body instanceof FormData ? opts.body.get('data') : opts?.body;
        const bodyText = body && typeof body.text === 'function' ? await body.text() : body;
        fetchCalls.push({ url: String(url), method: opts?.method, bodyText });
        throw NAV_SENTINEL;
      };

      try {
        await el._handleCreate({ detail: { name: 'my-sheet' } });
      } catch (e) {
        // expected NAV_SENTINEL
      } finally {
        window.fetch = savedFetch;
      }

      expect(fetchCalls).to.have.length(1);
      expect(fetchCalls[0].url).to.equal('https://admin.da.live/source/org/repo/my-sheet.json');
      expect(fetchCalls[0].method).to.equal('POST');
      const saved = JSON.parse(fetchCalls[0].bodyText);
      expect(saved[':type']).to.equal('sheet');
      expect(saved[':sheetname']).to.equal('data');
      expect(saved.data).to.deep.equal([]);
    });
  });

  describe('sendNewItem', () => {
    it('dispatches a newitem event with the item detail', () => {
      const el = new DaNew();
      let detail;
      el.dispatchEvent = (e) => { detail = e.detail; };
      el.sendNewItem({ name: 'foo', path: '/x', ext: 'html' });
      expect(detail).to.deep.equal({ item: { name: 'foo', path: '/x', ext: 'html' } });
    });
  });

  describe('handleNewType', () => {
    it('clicks the file input for media', () => {
      const el = new DaNew();
      let clicked = false;
      Object.defineProperty(el, 'shadowRoot', {
        configurable: true,
        value: { querySelector: () => ({ click: () => { clicked = true; } }) },
      });
      el.handleNewType({ detail: { id: 'media' } });
      expect(clicked).to.be.true;
    });

    it('reads type from e.target.dataset.type when e.detail is absent', () => {
      const el = new DaNew();
      el.handleNewType({ target: { dataset: { type: 'document' } } });
      expect(el._createDialogOpen).to.be.true;
      expect(el._createType).to.equal('document');
    });
  });

  describe('handleAddFile', () => {
    it('returns early when no file is selected', async () => {
      const el = new DaNew();
      const target = { files: [], value: '' };
      await el.handleAddFile({ target });
      expect(el._loading).to.not.be.ok;
    });

    it('strips trailing hyphen from the filename base', async () => {
      const el = new DaNew();
      el.fullpath = '/org/repo';

      const savedFetch = window.fetch;
      const sendEvents = [];
      el.sendNewItem = (item) => sendEvents.push(item);
      window.fetch = async (url) => {
        if (String(url).includes('/ping/')) return new Response('', { status: 200 });
        return new Response('ok', { status: 200 });
      };

      const target = { files: [{ name: 'hello world!.png' }], value: '' };
      try {
        await el.handleAddFile({ target });
      } finally {
        window.fetch = savedFetch;
      }

      expect(sendEvents).to.have.length(1);
      expect(sendEvents[0].name).to.equal('hello-world');
      expect(sendEvents[0].path).to.equal('/org/repo/hello-world.png');
      expect(sendEvents[0].ext).to.equal('png');
    });

    it('collapses consecutive invalid chars in the filename base', async () => {
      const el = new DaNew();
      el.fullpath = '/org/repo';

      const savedFetch = window.fetch;
      const sendEvents = [];
      el.sendNewItem = (item) => sendEvents.push(item);
      window.fetch = async (url) => {
        if (String(url).includes('/ping/')) return new Response('', { status: 200 });
        return new Response('ok', { status: 200 });
      };

      const target = { files: [{ name: 'foo!!bar.jpg' }], value: '' };
      try {
        await el.handleAddFile({ target });
      } finally {
        window.fetch = savedFetch;
      }

      expect(sendEvents[0].name).to.equal('foo-bar');
      expect(sendEvents[0].path).to.equal('/org/repo/foo-bar.jpg');
    });

    it('preserves internal dots while stripping trailing hyphens', async () => {
      const el = new DaNew();
      el.fullpath = '/org/repo';

      const savedFetch = window.fetch;
      const sendEvents = [];
      el.sendNewItem = (item) => sendEvents.push(item);
      window.fetch = async (url) => {
        if (String(url).includes('/ping/')) return new Response('', { status: 200 });
        return new Response('ok', { status: 200 });
      };

      // Base before ext is "my.file name!" -> "my.file-name-" -> "my.file-name"
      const target = { files: [{ name: 'my.file name!.html' }], value: '' };
      try {
        await el.handleAddFile({ target });
      } finally {
        window.fetch = savedFetch;
      }

      expect(sendEvents[0].name).to.equal('my.file-name');
      expect(sendEvents[0].path).to.equal('/org/repo/my.file-name.html');
    });

    it('resets the file input value after upload', async () => {
      const el = new DaNew();
      el.fullpath = '/org/repo';
      el.sendNewItem = () => {};

      const savedFetch = window.fetch;
      window.fetch = async (url) => {
        if (String(url).includes('/ping/')) return new Response('', { status: 200 });
        return new Response('ok', { status: 200 });
      };

      const target = { files: [{ name: 'test.png' }], value: 'test.png' };
      try {
        await el.handleAddFile({ target });
      } finally {
        window.fetch = savedFetch;
      }

      expect(target.value).to.equal('');
    });
  });

  describe('_disabled getter', () => {
    it('disabled when no permissions provided', () => {
      const el = new DaNew();
      expect(el._disabled).to.be.true;
    });

    it('disabled when only read permission', () => {
      const el = new DaNew();
      el.permissions = ['read'];
      expect(el._disabled).to.be.true;
    });

    it('enabled when write permission is included', () => {
      const el = new DaNew();
      el.permissions = ['read', 'write'];
      expect(el._disabled).to.be.false;
    });
  });
});
