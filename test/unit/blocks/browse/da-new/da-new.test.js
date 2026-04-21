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

  describe('handleNameChange', () => {
    it('lowercases and replaces invalid chars with hyphens', () => {
      const el = new DaNew();
      const target = { value: 'Foo Bar', placeholder: 'name', classList: { remove: () => {} } };
      el.handleNameChange({ target });
      expect(el._createName).to.equal('foo-bar');
      expect(target.value).to.equal('foo-bar');
    });

    it('collapses consecutive invalid chars into a single hyphen', () => {
      const el = new DaNew();
      const target = { value: 'foo!!bar', placeholder: 'name', classList: { remove: () => {} } };
      el.handleNameChange({ target });
      expect(el._createName).to.equal('foo-bar');
      expect(target.value).to.equal('foo-bar');
    });

    it('collapses an invalid char typed right after an existing hyphen', () => {
      // Simulates the DOM state after a prior keystroke: input value is "foo-",
      // user types another invalid character making it "foo-!".
      const el = new DaNew();
      const target = { value: 'foo-!', placeholder: 'name', classList: { remove: () => {} } };
      el.handleNameChange({ target });
      expect(el._createName).to.equal('foo-');
      // Explicit DOM sync is required here: without it, Lit's property binding
      // would skip the re-render when the sanitized value is unchanged.
      expect(target.value).to.equal('foo-');
    });

    it('preserves a single trailing hyphen during typing', () => {
      const el = new DaNew();
      const target = { value: 'foo!', placeholder: 'name', classList: { remove: () => {} } };
      el.handleNameChange({ target });
      expect(el._createName).to.equal('foo-');
      expect(target.value).to.equal('foo-');
    });

    it('removes the input-error class on the name input', () => {
      const el = new DaNew();
      let removed = false;
      const target = {
        value: 'abc',
        placeholder: 'name',
        classList: { remove: (cls) => { if (cls === 'da-input-error') removed = true; } },
      };
      el.handleNameChange({ target });
      expect(removed).to.be.true;
    });

    it('does not touch the class list when the input is the url field', () => {
      const el = new DaNew();
      let removed = false;
      const target = {
        value: 'abc',
        placeholder: 'url',
        classList: { remove: () => { removed = true; } },
      };
      el.handleNameChange({ target });
      expect(removed).to.be.false;
    });
  });

  describe('handleSave', () => {
    function stubShadowRoot(el, selectorMap) {
      // shadowRoot is a read-only DOM property, so we have to shadow it on the
      // instance via defineProperty rather than simple assignment.
      Object.defineProperty(el, 'shadowRoot', {
        configurable: true,
        value: { querySelector: (selector) => (selector in selectorMap ? selectorMap[selector] : null) },
      });
    }

    function makeNameInput() {
      return { classList: { added: [], add(c) { this.added.push(c); }, remove() {} } };
    }

    it('does not save and flags the input when _createName is empty', async () => {
      const el = new DaNew();
      const input = makeNameInput();
      stubShadowRoot(el, { '.da-actions-input[placeholder="name"]': input });
      el._createName = '';
      let reset = false;
      el.resetCreate = () => { reset = true; };

      await el.handleSave();
      expect(input.classList.added).to.include('da-input-error');
      expect(reset).to.be.false;
    });

    it('flags the input when the finalized name becomes empty after trimming', async () => {
      const el = new DaNew();
      const input = makeNameInput();
      stubShadowRoot(el, { '.da-actions-input[placeholder="name"]': input });
      // Only hyphens -> trims to empty string.
      el._createName = '---';
      let reset = false;
      el.resetCreate = () => { reset = true; };

      await el.handleSave();
      expect(input.classList.added).to.include('da-input-error');
      expect(reset).to.be.false;
    });

    it('strips a trailing hyphen from _createName before saving (link type)', async () => {
      const el = new DaNew();
      const input = makeNameInput();
      stubShadowRoot(el, { '.da-actions-input[placeholder="name"]': input });
      el._createName = 'foo-';
      el._createType = 'link';
      el._externalUrl = 'https://example.com';
      el.fullpath = '/org/repo';
      el.editor = '';

      const savedPaths = [];
      // Intercept internal helpers rather than the global fetch because saveToDa
      // is imported into da-new.js and called directly.
      const sendEvents = [];
      el.sendNewItem = (item) => sendEvents.push(item);
      el.resetCreate = () => {};

      // Save uses window.fetch via saveToDa for the 'link' type.
      const savedFetch = window.fetch;
      window.fetch = (url, opts) => {
        savedPaths.push({ url, method: opts?.method });
        return Promise.resolve(new Response('ok', { status: 200 }));
      };

      try {
        await el.handleSave();
      } finally {
        window.fetch = savedFetch;
      }

      expect(el._createName).to.equal('foo');
      expect(sendEvents).to.have.length(1);
      expect(sendEvents[0].path).to.equal('/org/repo/foo.link');
      expect(sendEvents[0].name).to.equal('foo');
    });
  });

  describe('handleUpload', () => {
    it('returns false when no file has been selected', async () => {
      const el = new DaNew();
      el._fileLabel = 'Select file';
      const label = { classList: { added: [], add(c) { this.added.push(c); } } };
      Object.defineProperty(el, 'shadowRoot', {
        configurable: true,
        value: { querySelector: () => label },
      });

      const result = await el.handleUpload({ preventDefault: () => {}, target: document.createElement('form') });
      expect(result).to.equal(false);
      expect(label.classList.added).to.include('da-input-error');
    });

    it('strips trailing hyphen from the filename base', async () => {
      const el = new DaNew();
      el._fileLabel = 'hello world!.png';
      el.fullpath = '/org/repo';

      let capturedUrl;
      const savedFetch = window.fetch;
      window.fetch = (url) => {
        capturedUrl = url;
        return Promise.resolve(new Response('ok', { status: 200 }));
      };

      const sendEvents = [];
      el.sendNewItem = (item) => sendEvents.push(item);
      el.resetCreate = () => {};
      el.requestUpdate = () => {};

      const form = document.createElement('form');
      try {
        await el.handleUpload({ preventDefault: () => {}, target: form });
      } finally {
        window.fetch = savedFetch;
      }

      expect(sendEvents).to.have.length(1);
      expect(sendEvents[0].name).to.equal('hello-world');
      expect(sendEvents[0].path).to.equal('/org/repo/hello-world.png');
      expect(sendEvents[0].ext).to.equal('png');
      expect(capturedUrl).to.include('/org/repo/hello-world.png');
    });

    it('collapses consecutive invalid chars in the filename base', async () => {
      const el = new DaNew();
      el._fileLabel = 'foo!!bar.jpg';
      el.fullpath = '/org/repo';

      const savedFetch = window.fetch;
      window.fetch = () => Promise.resolve(new Response('ok', { status: 200 }));

      const sendEvents = [];
      el.sendNewItem = (item) => sendEvents.push(item);
      el.resetCreate = () => {};
      el.requestUpdate = () => {};

      try {
        await el.handleUpload({ preventDefault: () => {}, target: document.createElement('form') });
      } finally {
        window.fetch = savedFetch;
      }

      expect(sendEvents[0].name).to.equal('foo-bar');
      expect(sendEvents[0].path).to.equal('/org/repo/foo-bar.jpg');
    });

    it('preserves internal dots while stripping trailing hyphens', async () => {
      const el = new DaNew();
      el._fileLabel = 'my.file name!.html';
      el.fullpath = '/org/repo';

      const savedFetch = window.fetch;
      window.fetch = () => Promise.resolve(new Response('ok', { status: 200 }));

      const sendEvents = [];
      el.sendNewItem = (item) => sendEvents.push(item);
      el.resetCreate = () => {};
      el.requestUpdate = () => {};

      try {
        await el.handleUpload({ preventDefault: () => {}, target: document.createElement('form') });
      } finally {
        window.fetch = savedFetch;
      }

      // Base before ext is "my.file name!" -> "my.file-name-" -> "my.file-name".
      expect(sendEvents[0].name).to.equal('my.file-name');
      expect(sendEvents[0].path).to.equal('/org/repo/my.file-name.html');
    });
  });
});
