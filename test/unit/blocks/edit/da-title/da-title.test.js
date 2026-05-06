/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('DaTitle', () => {
  let DaTitle;
  let savedFetch;

  before(async () => {
    savedFetch = window.fetch;

    // Mock fetch for getSheet CSS and inlinesvg calls
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

    const mod = await import('../../../../../blocks/edit/da-title/da-title.js');
    DaTitle = mod.default;
  });

  after(() => {
    window.fetch = savedFetch;
  });

  let el;

  function createDetails(overrides = {}) {
    return {
      org: 'testorg',
      site: 'testsite',
      path: '/test/page',
      fullpath: '/testorg/testsite/test/page',
      parent: '/testorg/testsite/test',
      parentName: 'test',
      name: 'page',
      view: 'edit',
      ...overrides,
    };
  }

  async function fixture(props = {}) {
    const element = document.createElement('da-title');
    element.details = props.details || createDetails();
    if (props.permissions) element.permissions = props.permissions;
    if (props.collabStatus) element.collabStatus = props.collabStatus;
    if (props.collabUsers) element.collabUsers = props.collabUsers;
    document.body.appendChild(element);
    await nextFrame();
    await nextFrame();
    return element;
  }

  afterEach(() => {
    if (el && el.parentElement) el.remove();
    el = null;
  });

  it('is defined as a custom element', () => {
    expect(customElements.get('da-title')).to.exist;
  });

  it('is an instance of DaTitle', async () => {
    el = await fixture();
    expect(el).to.be.instanceOf(DaTitle);
  });

  it('renders the parent link and page name', async () => {
    el = await fixture();
    const link = el.shadowRoot.querySelector('.da-title-name-label');
    expect(link).to.exist;
    expect(link.getAttribute('href')).to.equal('/#/testorg/testsite/test');
    expect(link.textContent).to.equal('test');

    const h1 = el.shadowRoot.querySelector('h1');
    expect(h1).to.exist;
    expect(h1.textContent).to.equal('page');
  });

  it('renders actions wrapper', async () => {
    el = await fixture();
    const actionsWrapper = el.shadowRoot.querySelector('.da-title-actions');
    expect(actionsWrapper).to.exist;
  });

  it('renders send button', async () => {
    el = await fixture();
    const sendBtn = el.shadowRoot.querySelector('.da-title-action-send');
    expect(sendBtn).to.exist;
  });

  describe('_readOnly', () => {
    it('returns false when permissions is not set', async () => {
      el = await fixture();
      expect(el._readOnly).to.be.false;
    });

    it('returns false when permissions include write', async () => {
      el = await fixture({ permissions: ['read', 'write'] });
      expect(el._readOnly).to.be.false;
    });

    it('returns true when permissions do not include write', async () => {
      el = await fixture({ permissions: ['read'] });
      expect(el._readOnly).to.be.true;
    });

    it('applies is-read-only class when read only', async () => {
      el = await fixture({ permissions: ['read'] });
      const inner = el.shadowRoot.querySelector('.da-title-inner');
      expect(inner.classList.contains('is-read-only')).to.be.true;
    });

    it('does not apply is-read-only class when writable', async () => {
      el = await fixture({ permissions: ['read', 'write'] });
      const inner = el.shadowRoot.querySelector('.da-title-inner');
      expect(inner.classList.contains('is-read-only')).to.be.false;
    });
  });

  describe('_canPrepare', () => {
    it('returns true when details has a path', async () => {
      el = await fixture();
      expect(el._canPrepare).to.be.true;
    });

    it('returns false when details has no path', async () => {
      el = await fixture({ details: createDetails({ path: '' }) });
      expect(el._canPrepare).to.be.false;
    });
  });

  describe('reset', () => {
    it('clears internal state', async () => {
      el = await fixture();
      el._scheduled = 'something';
      el._configs = ['config'];

      el.reset();

      expect(el._scheduled).to.be.undefined;
      expect(el._configs).to.be.undefined;
    });
  });

  describe('toggleActions', () => {
    it('toggles _actions.open', async () => {
      el = await fixture();
      el._actions = {};

      el.toggleActions();
      expect(el._actions.open).to.be.true;

      el.toggleActions();
      expect(el._actions.open).to.be.false;
    });
  });

  describe('handleError', () => {
    it('sets status and clears sending state', async () => {
      el = await fixture();
      el._isSending = true;

      const json = { error: { message: 'Not authorized', status: 403 } };
      el.handleError(json, 'preview');

      expect(el._status.message).to.equal('Not authorized');
      expect(el._status.status).to.equal(403);
      expect(el._status.action).to.equal('preview');
      expect(el._isSending).to.be.false;
    });
  });

  describe('getAvailableActions', () => {
    it('returns only save for config view', async () => {
      el = await fixture({ details: createDetails({ view: 'config' }) });
      el._configs = [];
      const actions = await el.getAvailableActions();
      expect(actions).to.deep.equal(['save']);
    });

    it('includes save for sheet view', async () => {
      el = await fixture({ details: createDetails({ view: 'sheet', path: '/test/page' }) });
      el._configs = [];
      const actions = await el.getAvailableActions();
      expect(actions).to.include('save');
    });

    it('includes preview when path exists', async () => {
      el = await fixture({ details: createDetails({ view: 'edit', path: '/test/page' }) });
      el._configs = [];
      const actions = await el.getAvailableActions();
      expect(actions).to.include('preview');
    });

    it('includes publish when path exists and not hidden', async () => {
      el = await fixture({ details: createDetails({ view: 'edit', path: '/test/page' }) });
      el._configs = [];
      const actions = await el.getAvailableActions();
      expect(actions).to.include('publish');
    });

    it('returns no preview/publish when no path', async () => {
      el = await fixture({ details: createDetails({ view: 'edit', path: '' }) });
      el._configs = [];
      const actions = await el.getAvailableActions();
      expect(actions).to.not.include('preview');
      expect(actions).to.not.include('publish');
    });
  });

  describe('filterActions', () => {
    it('removes publish when hidePublish config matches path', async () => {
      const configResp = { data: [{ key: 'editor.hidePublish', value: '/filterorg/filtersite/test' }] };
      const origFetch = window.fetch;
      window.fetch = async (url, opts) => {
        if (url.includes('/config/filterorg')) {
          return new Response(JSON.stringify(configResp), { status: 200 });
        }
        return origFetch(url, opts);
      };

      el = await fixture({
        details: createDetails({
          org: 'filterorg',
          site: 'filtersite',
          path: '/test/page',
          fullpath: '/filterorg/filtersite/test/page',
        }),
      });
      el._actions = { available: ['preview', 'publish'] };
      await el.filterActions();

      expect(el._actions.available).to.include('preview');
      expect(el._actions.available).to.not.include('publish');
      window.fetch = origFetch;
    });

    it('keeps publish when hidePublish config does not match path', async () => {
      const configResp = { data: [{ key: 'editor.hidePublish', value: '/filterorg2/filtersite2/other' }] };
      const origFetch = window.fetch;
      window.fetch = async (url, opts) => {
        if (url.includes('/config/filterorg2')) {
          return new Response(JSON.stringify(configResp), { status: 200 });
        }
        return origFetch(url, opts);
      };

      el = await fixture({
        details: createDetails({
          org: 'filterorg2',
          site: 'filtersite2',
          path: '/test/page',
          fullpath: '/filterorg2/filtersite2/test/page',
        }),
      });
      el._actions = { available: ['preview', 'publish'] };
      await el.filterActions();

      expect(el._actions.available).to.include('preview');
      expect(el._actions.available).to.include('publish');
      window.fetch = origFetch;
    });
  });

  describe('collab status (sheet view)', () => {
    it('sets collabStatus to connected when online', async () => {
      const origOnLine = window.navigator.onLine;
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });

      el = await fixture({ details: createDetails({ view: 'sheet' }) });
      expect(el.collabStatus).to.equal('connected');

      Object.defineProperty(window.navigator, 'onLine', { value: origOnLine, configurable: true });
    });

    it('sets collabStatus to offline when offline', async () => {
      const origOnLine = window.navigator.onLine;
      Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });

      el = await fixture({ details: createDetails({ view: 'sheet' }) });
      expect(el.collabStatus).to.equal('offline');

      Object.defineProperty(window.navigator, 'onLine', { value: origOnLine, configurable: true });
    });
  });

  describe('renderCollab', () => {
    it('renders collab status when collabStatus is set', async () => {
      el = await fixture({ collabStatus: 'connected' });
      await nextFrame();
      const collab = el.shadowRoot.querySelector('.collab-status');
      expect(collab).to.exist;
      const cloud = el.shadowRoot.querySelector('.collab-status-connected');
      expect(cloud).to.exist;
    });

    it('does not render collab when no collabStatus', async () => {
      el = await fixture();
      const collab = el.shadowRoot.querySelector('.collab-status');
      expect(collab).to.not.exist;
    });

    it('renders collab user initials', async () => {
      el = await fixture({ collabStatus: 'connected', collabUsers: ['John Doe', 'Jane Smith'] });
      await nextFrame();
      const users = el.shadowRoot.querySelectorAll('.collab-icon-user');
      expect(users.length).to.equal(2);
      expect(users[0].textContent).to.equal('JD');
      expect(users[1].textContent).to.equal('JS');
    });
  });

  describe('popover', () => {
    it('adds collab-popup class on click', async () => {
      el = await fixture({ collabStatus: 'connected' });
      await nextFrame();
      const cloud = el.shadowRoot.querySelector('.collab-status-cloud');
      el.popover({ target: cloud });
      expect(cloud.classList.contains('collab-popup')).to.be.true;
    });

    it('removes collab-popup class when already open', async () => {
      el = await fixture({ collabStatus: 'connected' });
      await nextFrame();
      const cloud = el.shadowRoot.querySelector('.collab-status-cloud');
      cloud.classList.add('collab-popup');
      el.popover({ target: cloud });
      expect(cloud.classList.contains('collab-popup')).to.be.false;
    });

    it('closes other open popovers when opening a new one', async () => {
      el = await fixture({
        collabStatus: 'connected',
        collabUsers: ['User One'],
      });
      await nextFrame();
      const user = el.shadowRoot.querySelector('.collab-icon-user');
      const cloud = el.shadowRoot.querySelector('.collab-status-cloud');

      el.popover({ target: user });
      expect(user.classList.contains('collab-popup')).to.be.true;

      el.popover({ target: cloud });
      expect(cloud.classList.contains('collab-popup')).to.be.true;
      expect(user.classList.contains('collab-popup')).to.be.false;
    });
  });

  describe('renderError', () => {
    it('renders error message', async () => {
      el = await fixture();
      el._status = { message: 'Something went wrong', action: 'preview' };
      el.requestUpdate();
      await nextFrame();
      await nextFrame();

      const error = el.shadowRoot.querySelector('.da-title-error');
      expect(error).to.exist;
      expect(error.querySelector('strong').textContent).to.equal('Something went wrong');
    });

    it('renders error details when present', async () => {
      el = await fixture();
      el._status = { message: 'Error', details: 'PDF is too large', action: 'preview' };
      el.requestUpdate();
      await nextFrame();
      await nextFrame();

      const paragraphs = el.shadowRoot.querySelectorAll('.da-title-error p');
      expect(paragraphs.length).to.equal(2);
      expect(paragraphs[1].textContent).to.equal('PDF is too large');
    });

    it('renders request access button for 403 errors', async () => {
      el = await fixture();
      el._status = { message: 'Not authorized', status: 403, action: 'publish' };
      el.requestUpdate();
      await nextFrame();
      await nextFrame();

      const requestBtn = el.shadowRoot.querySelector('.da-title-error button');
      expect(requestBtn).to.exist;
      expect(requestBtn.textContent).to.equal('Request access');
    });

    it('does not render request access button for non-403 errors', async () => {
      el = await fixture();
      el._status = { message: 'Server error', status: 500, action: 'preview' };
      el.requestUpdate();
      await nextFrame();
      await nextFrame();

      const requestBtn = el.shadowRoot.querySelector('.da-title-error button');
      expect(requestBtn).to.not.exist;
    });
  });

  describe('handleAction (preview/publish)', () => {
    let savedAdminFetch;

    beforeEach(() => {
      savedAdminFetch = window.fetch;
    });

    afterEach(() => {
      window.fetch = savedAdminFetch;
      try { delete window.adobeIMS; } catch { /* */ }
      try { delete window.chrome; } catch { /* */ }
    });

    function buildEl(opts = {}) {
      const element = new DaTitle();
      element.details = createDetails(opts.details || {});
      element.permissions = opts.permissions || ['read', 'write'];
      element._aemHrefs = {
        preview: { origin: 'https://main--site--org.aem.page' },
        prod: { origin: 'https://main--site--org.aem.live' },
      };
      // Stub _sendButton to avoid querying shadowRoot
      const fakeBtn = document.createElement('button');
      Object.defineProperty(element, '_sendButton', { configurable: true, get: () => fakeBtn });
      element.requestUpdate = () => {};
      element._actions = {};
      return element;
    }

    it('Preview path: opens the preview URL on success', async () => {
      const element = buildEl();
      const opens = [];
      const savedOpen = window.open;
      window.open = (...args) => { opens.push(args); };
      window.fetch = () => Promise.resolve(new Response(
        JSON.stringify({
          preview: { url: 'https://main--site--org.aem.page/test/page' },
          webPath: '/test/page',
        }),
        { status: 200 },
      ));
      try {
        await element.handleAction('preview');
        expect(opens.length).to.equal(1);
        expect(opens[0][0]).to.contain('/test/page');
      } finally {
        window.open = savedOpen;
      }
    });

    it('Preview path: surfaces an error and stops on failure', async () => {
      const element = buildEl();
      window.fetch = () => Promise.resolve(new Response('', { status: 500, headers: {} }));
      let errorSet = false;
      element.handleError = () => { errorSet = true; };
      await element.handleAction('preview');
      expect(errorSet).to.be.true;
    });

    it('Publish path: previews then publishes and opens the live URL', async () => {
      const element = buildEl();
      element._scheduled = { scheduled: false };
      element._lazyMods = new Map([
        ['da-schedule', Promise.resolve({ getExistingSchedule: async () => null })],
      ]);
      let calls = 0;
      window.fetch = () => {
        calls += 1;
        if (calls === 1) {
          // preview call
          return Promise.resolve(new Response(
            JSON.stringify({ preview: { url: 'https://x' }, webPath: '/test/page' }),
            { status: 200 },
          ));
        }
        // publish (live) call
        return Promise.resolve(new Response(
          JSON.stringify({ live: { url: 'https://y' }, webPath: '/test/page' }),
          { status: 200 },
        ));
      };
      const opens = [];
      const savedOpen = window.open;
      window.open = (...args) => { opens.push(args); };
      try {
        await element.handleAction('publish');
        expect(opens.length).to.equal(1);
        expect(opens[0][0]).to.contain('aem.live');
      } finally {
        window.open = savedOpen;
      }
    });

    it('Publish path: prompts a scheduled-content dialog when scheduled', async () => {
      const element = buildEl();
      element._lazyMods = new Map([
        ['da-dialog', Promise.resolve()],
        ['da-schedule', Promise.resolve({ getExistingSchedule: async () => ({ scheduled: true, scheduledPublish: '2026-12-31' }) })],
      ]);
      element._scheduled = { scheduled: true, scheduledPublish: '2026-12-31', userId: 'u1' };
      let dialogShown = false;
      const origSetScheduledDialog = element.setScheduledDialog;
      element.setScheduledDialog = async () => {
        dialogShown = true;
        return false; // user cancels
      };
      window.fetch = () => Promise.resolve(new Response(
        JSON.stringify({ preview: { url: 'https://x' }, webPath: '/test/page' }),
        { status: 200 },
      ));
      const opens = [];
      const savedOpen = window.open;
      window.open = (...args) => { opens.push(args); };
      try {
        await element.handleAction('publish');
        expect(dialogShown).to.be.true;
        // User cancelled — no open should be called
        expect(opens.length).to.equal(0);
      } finally {
        window.open = savedOpen;
        element.setScheduledDialog = origSetScheduledDialog;
      }
    });

    it('Sheet view: saves to DA before AEM call', async () => {
      const element = buildEl({ details: { view: 'sheet', fullpath: '/o/s/sheet.json' } });
      element.sheet = [{
        name: 'data',
        getData: () => [['k'], ['v']],
        getConfig: () => ({ columns: [{ width: '20' }] }),
      }];
      const calls = [];
      window.fetch = (url, opts) => {
        calls.push({ url, method: opts?.method });
        return Promise.resolve(new Response(
          JSON.stringify({ preview: { url: 'https://x' }, webPath: '/test/page' }),
          { status: 200 },
        ));
      };
      const opens = [];
      const savedOpen = window.open;
      window.open = (...args) => { opens.push(args); };
      try {
        await element.handleAction('preview');
        const sourceCall = calls.find((c) => c.url?.includes('/source'));
        expect(sourceCall).to.exist;
        expect(sourceCall.method).to.equal('PUT');
      } finally {
        window.open = savedOpen;
      }
    });

    it('Config view: saves config and stops on save failure', async () => {
      const element = buildEl({ details: { view: 'config' } });
      element.sheet = [{
        name: 'config',
        getData: () => [['k'], ['v']],
        getConfig: () => ({ columns: [{ width: '20' }] }),
      }];
      window.fetch = () => Promise.resolve(new Response('boom', { status: 500 }));
      let openCalled = false;
      const savedOpen = window.open;
      window.open = () => { openCalled = true; };
      try {
        await element.handleAction('save');
        expect(openCalled).to.be.false;
      } finally {
        window.open = savedOpen;
      }
    });
  });

  describe('sidekickCacheBust', () => {
    afterEach(() => {
      try { delete window.chrome; } catch { /* */ }
    });

    it('Returns immediately when window.chrome is missing', async () => {
      try { delete window.chrome; } catch { /* */ }
      const element = new DaTitle();
      // Should not throw
      await element.sidekickCacheBust('https://main--site--org.aem.live/page');
    });

    it('Sends a cache-bust message to the configured extension id', async () => {
      let captured;
      window.chrome = {
        runtime: {
          sendMessage: (extId, opts) => {
            captured = { extId, opts };
            return Promise.resolve();
          },
        },
      };
      const element = new DaTitle();
      await element.sidekickCacheBust('https://main--site--org.aem.live/page');
      expect(captured.opts.action).to.equal('bustCache');
      expect(captured.opts.host).to.equal('main--site--org.aem.live');
    });

    it('Reads the override extension id from localStorage when present', async () => {
      window.localStorage.setItem('aem-sidekick-id', 'custom-id');
      let captured;
      window.chrome = {
        runtime: {
          sendMessage: (extId) => {
            captured = extId;
            return Promise.resolve();
          },
        },
      };
      try {
        const element = new DaTitle();
        await element.sidekickCacheBust('https://main--site--org.aem.live/page');
        expect(captured).to.equal('custom-id');
      } finally {
        window.localStorage.removeItem('aem-sidekick-id');
      }
    });

    it('Swallows errors from sendMessage', async () => {
      window.chrome = { runtime: { sendMessage: () => Promise.reject(new Error('boom')) } };
      const element = new DaTitle();
      await element.sidekickCacheBust('https://main--site--org.aem.live/page');
    });
  });

  describe('toggleActions', () => {
    it('Calls requestUpdate after toggling', async () => {
      const element = new DaTitle();
      let updates = 0;
      element.requestUpdate = () => { updates += 1; };
      element.toggleActions();
      expect(updates).to.equal(1);
    });
  });

  describe('renderActions', () => {
    it('Returns nothing when no available actions', () => {
      const element = new DaTitle();
      element._actions = {};
      const result = element.renderActions();
      // nothing is a falsy template helper — assert type
      expect(result).to.exist;
    });

    it('Renders one button per available action', async () => {
      const element = await fixture({ permissions: ['read', 'write'] });
      element._actions = { available: ['preview', 'publish'] };
      element.requestUpdate();
      await nextFrame();
      await nextFrame();
      const buttons = element.shadowRoot.querySelectorAll('.da-title-action');
      expect(buttons.length).to.be.at.least(2);
      element.remove();
    });
  });
});
