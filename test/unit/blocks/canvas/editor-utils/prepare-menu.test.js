/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

// Wait for loadMenu (which awaits fetchDaConfigs) to finish
const waitForMenu = () => new Promise((resolve) => { setTimeout(resolve, 50); });

describe('PrepareMenu', () => {
  let PrepareMenu;
  let readSdkMode;
  let savedFetch;

  before(async () => {
    savedFetch = window.fetch;
    const initialUrl = window.location.href;
    const testUrl = new URL(initialUrl);
    testUrl.searchParams.set('ref', 'feature/foo');
    window.history.replaceState({}, '', testUrl);

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
      if (url.includes('/config/')) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    setNx('/test/fixtures/nx', { hostname: 'example.com' });

    const mod = await import('../../../../../blocks/canvas/editor-utils/prepare-menu.js');
    PrepareMenu = mod.default;
    ({ readSdkMode } = mod);
    window.history.replaceState({}, '', initialUrl);
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
      view: 'edit',
      ...overrides,
    };
  }

  async function fixture(props = {}) {
    const element = document.createElement('prepare-menu');
    element.details = props.details || createDetails();
    canvasBus.branchState.emit({
      org: element.details.org,
      site: element.details.site,
      path: element.details.fullpath,
      status: 'ready',
      branch: 'feature-foo',
    });
    document.body.appendChild(element);
    await waitForMenu();
    await nextFrame();
    return element;
  }

  // The fixture popover stub is a plain HTMLElement — add show/close spies per test.
  function stubPopover(element) {
    const popover = element.shadowRoot.querySelector('nx-popover');
    if (!popover) return null;
    popover.open = false;
    popover.show = () => { popover.open = true; };
    popover.close = () => { popover.open = false; };
    return popover;
  }

  afterEach(() => {
    if (el && el.parentElement) el.remove();
    el = null;
    canvasBus.branchState.emit({ path: null, status: 'pending' });
  });

  it('is defined as a custom element', () => {
    expect(customElements.get('prepare-menu')).to.exist;
  });

  it('is an instance of PrepareMenu', async () => {
    el = await fixture();
    expect(el).to.be.instanceOf(PrepareMenu);
  });

  describe('reset', () => {
    it('closes both SDK2 and legacy connections', async () => {
      el = await fixture();
      let extensionsClosed = 0;
      let portsClosed = 0;
      el._ext = { close: () => { extensionsClosed += 1; } };
      el._port = { close: () => { portsClosed += 1; } };
      el._comparison = 'requested';

      el.reset();

      expect(extensionsClosed).to.equal(1);
      expect(portsClosed).to.equal(1);
      expect(el._ext).to.be.undefined;
      expect(el._port).to.be.undefined;
      expect(el._comparison).to.be.undefined;
    });

    it('clears _menuItems and _dialogItem', async () => {
      el = await fixture();
      el._menuItems = [{ title: 'Test' }];
      el._dialogItem = { title: 'dialog' };
      el._fullsizeDialogItem = { title: 'large dialog' };

      el.reset();

      expect(el._menuItems).to.be.undefined;
      expect(el._dialogItem).to.be.undefined;
      expect(el._fullsizeDialogItem).to.be.undefined;
    });

    it('closes an open fullsize dialog before clearing state', async () => {
      el = await fixture();
      const dialog = document.createElement('dialog');
      let closed = false;
      Object.defineProperty(dialog, 'open', { configurable: true, value: true });
      dialog.close = () => { closed = true; };
      dialog.className = 'prepare-fullsize-dialog';
      el.shadowRoot.append(dialog);

      el.reset();

      expect(closed).to.be.true;
      expect(el._fullsizeDialogItem).to.be.undefined;
    });
  });

  describe('loadMenu', () => {
    it('uses updated canvas branch state for custom previews and disables unresolved paths', async () => {
      const prevFetch = window.fetch;
      window.fetch = async (url) => (url.includes('/config/branch-menu-org')
        ? new Response(JSON.stringify({ prepare: { data: [{ title: 'Branch action', path: '/plugin.html' }] } }))
        : prevFetch(url));
      try {
        el = await fixture({ details: createDetails({ org: 'branch-menu-org', site: 'site' }) });
        const state = { org: 'branch-menu-org', site: 'site', path: '/branch-menu-org/site/page' };
        canvasBus.branchState.emit({ ...state, status: 'ready', branch: 'Configured/Branch' });
        await waitForMenu();
        expect(el._menuItems.find((item) => item.title === 'Branch action').path)
          .to.equal('https://configured-branch--site--branch-menu-org.stage-preview.da.live/plugin.html');
        canvasBus.branchState.emit({ ...state, status: 'pending' });
        await waitForMenu();
        expect(el._menuItems.find((item) => item.title === 'Branch action').disabled).to.be.true;
      } finally {
        window.fetch = prevFetch;
      }
    });

    it('loads non-optional OOTB actions by default', async () => {
      el = await fixture();

      const titles = el._menuItems.map((item) => item.title);
      expect(titles).to.include('Unpublish');
      expect(titles).to.not.include('Preflight');
    });

    it('excludes optional OOTB actions by default', async () => {
      el = await fixture();

      const titles = el._menuItems.map((item) => item.title);
      expect(titles).to.not.include('Schedule Publish');
      expect(titles).to.not.include('Send to Adobe Target');
    });

    it('includes optional OOTB actions when enabled by org config', async () => {
      const prevFetch = window.fetch;
      window.fetch = async (url) => {
        if (url.includes('/config/orgA/siteA')) {
          return new Response(JSON.stringify({}), { status: 200 });
        }
        if (url.includes('/config/orgA')) {
          const body = { prepare: { data: [{ title: 'Schedule Publish' }] } };
          return new Response(JSON.stringify(body), { status: 200 });
        }
        return prevFetch(url);
      };

      el = await fixture({ details: createDetails({ org: 'orgA', site: 'siteA' }) });

      const titles = el._menuItems.map((item) => item.title);
      expect(titles).to.include('Schedule Publish');

      window.fetch = prevFetch;
    });

    it('includes custom actions from site config', async () => {
      const prevFetch = window.fetch;
      window.fetch = async (url) => {
        if (url.includes('/config/orgB/siteB')) {
          const body = { prepare: { data: [{ title: 'Custom Action', path: 'https://example.com/custom' }] } };
          return new Response(JSON.stringify(body), { status: 200 });
        }
        if (url.includes('/config/orgB')) {
          return new Response(JSON.stringify({}), { status: 200 });
        }
        return prevFetch(url);
      };

      el = await fixture({ details: createDetails({ org: 'orgB', site: 'siteB' }) });

      const titles = el._menuItems.map((item) => item.title);
      expect(titles).to.include('Custom Action');

      window.fetch = prevFetch;
    });

    it('preserves fullsize-dialog experience from custom actions', async () => {
      const prevFetch = window.fetch;
      window.fetch = async (url) => {
        if (url.includes('/config/orgD/siteD')) {
          const body = {
            prepare: {
              data: [{
                title: 'Large Action',
                path: 'https://example.com/large',
                experience: 'fullsize-dialog',
              }],
            },
          };
          return new Response(JSON.stringify(body), { status: 200 });
        }
        if (url.includes('/config/orgD')) {
          return new Response(JSON.stringify({}), { status: 200 });
        }
        return prevFetch(url);
      };

      el = await fixture({ details: createDetails({ org: 'orgD', site: 'siteD' }) });

      const item = el._menuItems.find(({ title }) => title === 'Large Action');
      expect(item.experience).to.equal('fullsize-dialog');

      window.fetch = prevFetch;
    });

    it('falls back to OOTB render for config items without path or render', async () => {
      const prevFetch = window.fetch;
      window.fetch = async (url) => {
        if (url.includes('/config/orgC/siteC')) {
          const body = { prepare: { data: [{ title: 'Unpublish' }] } };
          return new Response(JSON.stringify(body), { status: 200 });
        }
        if (url.includes('/config/orgC')) {
          return new Response(JSON.stringify({}), { status: 200 });
        }
        return prevFetch(url);
      };

      el = await fixture({ details: createDetails({ org: 'orgC', site: 'siteC' }) });

      const unpublish = el._menuItems.find((item) => item.title === 'Unpublish');
      expect(unpublish.render).to.be.a('function');

      window.fetch = prevFetch;
    });

    it('skips Preflight sheet rows, which configure the Preflight side panel', async () => {
      const prevFetch = window.fetch;
      window.fetch = async (url) => {
        if (url.includes('/config/orgP/siteP')) {
          const body = { prepare: { data: [{ title: 'Preflight', path: 'https://example.com/pf' }] } };
          return new Response(JSON.stringify(body), { status: 200 });
        }
        if (url.includes('/config/orgP')) {
          const body = { prepare: { data: [{ title: 'Preflight' }] } };
          return new Response(JSON.stringify(body), { status: 200 });
        }
        return prevFetch(url);
      };

      el = await fixture({ details: createDetails({ org: 'orgP', site: 'siteP' }) });

      expect(el._menuItems.map((item) => item.title)).to.not.include('Preflight');
      expect(el._menuItems.map((item) => item.title)).to.include('Unpublish');

      window.fetch = prevFetch;
    });

    it('routes relative plugin paths and icons through the DA preview proxy', async () => {
      const prevFetch = window.fetch;
      window.fetch = async (url) => {
        if (url.includes('/config/orgE/siteE')) {
          const body = {
            prepare: {
              data: [{
                title: 'Plugin Action',
                path: '/tools/plugins/plugin-action/index.html',
                icon: '/tools/plugins/plugin-action/icon.svg',
              }],
            },
          };
          return new Response(JSON.stringify(body), { status: 200 });
        }
        if (url.includes('/config/orgE')) {
          return new Response(JSON.stringify({}), { status: 200 });
        }
        return prevFetch(url);
      };

      el = await fixture({ details: createDetails({ org: 'orgE', site: 'siteE' }) });

      const item = el._menuItems.find(({ title }) => title === 'Plugin Action');
      expect(item.path).to.equal('https://feature-foo--siteE--orgE.stage-preview.da.live/tools/plugins/plugin-action/index.html');
      expect(item.icon).to.equal('https://feature-foo--siteE--orgE.stage-preview.da.live/tools/plugins/plugin-action/icon.svg');

      window.fetch = prevFetch;
    });

    it('leaves cross-org absolute plugin paths and icons unproxied', async () => {
      const prevFetch = window.fetch;
      window.fetch = async (url) => {
        if (url.includes('/config/orgF/siteF')) {
          const body = {
            prepare: {
              data: [{
                title: 'Plugin Action',
                path: 'https://main--othersite--otherorg.aem.live/tools/plugins/plugin-action/index.html',
                icon: 'https://main--othersite--otherorg.aem.live/tools/plugins/plugin-action/icon.svg',
              }],
            },
          };
          return new Response(JSON.stringify(body), { status: 200 });
        }
        if (url.includes('/config/orgF')) {
          return new Response(JSON.stringify({}), { status: 200 });
        }
        return prevFetch(url);
      };

      el = await fixture({ details: createDetails({ org: 'orgF', site: 'siteF' }) });

      const item = el._menuItems.find(({ title }) => title === 'Plugin Action');
      // A plugin hosted by a different org keeps its original URL.
      expect(item.path).to.equal('https://main--othersite--otherorg.aem.live/tools/plugins/plugin-action/index.html');
      expect(item.icon).to.equal('https://main--othersite--otherorg.aem.live/tools/plugins/plugin-action/icon.svg');

      window.fetch = prevFetch;
    });

    it('routes absolute same-site plugin paths and icons through the DA preview proxy', async () => {
      const prevFetch = window.fetch;
      window.fetch = async (url) => {
        if (url.includes('/config/orgG/siteG')) {
          const body = {
            prepare: {
              data: [{
                title: 'Plugin Action',
                path: 'https://main--siteG--orgG.aem.live/tools/plugins/plugin-action/index.html',
                icon: 'https://main--siteG--orgG.aem.live/tools/plugins/plugin-action/icon.svg',
              }],
            },
          };
          return new Response(JSON.stringify(body), { status: 200 });
        }
        if (url.includes('/config/orgG')) {
          return new Response(JSON.stringify({}), { status: 200 });
        }
        return prevFetch(url);
      };

      el = await fixture({ details: createDetails({ org: 'orgG', site: 'siteG' }) });

      const item = el._menuItems.find(({ title }) => title === 'Plugin Action');
      expect(item.path).to.equal('https://main--siteg--orgg.stage-preview.da.live/tools/plugins/plugin-action/index.html');
      expect(item.icon).to.equal('https://main--siteg--orgg.stage-preview.da.live/tools/plugins/plugin-action/icon.svg');

      window.fetch = prevFetch;
    });
  });

  describe('readSdkMode', () => {
    [
      [{}, 'legacy'],
      [{ sdk: '' }, 'legacy'],
      [{ sdk: undefined }, 'legacy'],
      [{ sdk: '1' }, 'legacy'], [{ sdk: 1 }, 'legacy'], [{ sdk: ' 1 ' }, 'legacy'],
      [{ sdk: '2' }, 'sdk2'], [{ sdk: 2 }, 'sdk2'], [{ sdk: ' 2 ' }, 'sdk2'],
      [{ sdk: '3' }, 'invalid'], [{ sdk: 'true' }, 'invalid'], [{ sdk: '0' }, 'invalid'],
    ].forEach(([item, mode]) => {
      it(`${JSON.stringify(item)} -> ${mode}`, () => {
        expect(readSdkMode(item)).to.equal(mode);
      });
    });
  });

  describe('sdk2 rows', () => {
    let savedIMS;
    let tokenCalls;

    const sdkItem = { title: 'Snap', path: 'https://ext.example.com/snap.html', experience: 'fullsize-dialog', sdk: '2' };

    async function openItem(item) {
      el = await fixture();
      stubPopover(el);
      el.handleItemClick = PrepareMenu.prototype.handleItemClick;
      el._fullsizeDialogItem = undefined;
      if (item.experience === 'fullsize-dialog') el._fullsizeDialogItem = item;
      else el._dialogItem = item;
      await new Promise((r) => { setTimeout(r, 150); });
      return el.shadowRoot.querySelector('iframe');
    }

    beforeEach(() => {
      globalThis.__extHostCalls = [];
      tokenCalls = 0;
      savedIMS = window.adobeIMS;
      window.adobeIMS = {
        getAccessToken: () => {
          tokenCalls += 1;
          return { token: 'T' };
        },
      };
    });

    afterEach(() => {
      window.adobeIMS = savedIMS;
      delete globalThis.__extHostCalls;
    });

    it('connects the extension host with iframe and context, without token or legacy message', async () => {
      const initialUrl = window.location.href;
      const testUrl = new URL(initialUrl);
      testUrl.searchParams.set('ref', 'feature/foo');
      window.history.replaceState({}, '', testUrl);
      let iframe;
      try {
        iframe = await openItem(sdkItem);
        iframe.dispatchEvent(new Event('load'));
        await new Promise((r) => { setTimeout(r, 800); });
      } finally {
        window.history.replaceState({}, '', initialUrl);
      }

      expect(globalThis.__extHostCalls).to.have.length(1);
      const [call] = globalThis.__extHostCalls;
      expect(call.iframe).to.equal(iframe);
      expect(call.context).to.deep.equal({
        view: 'edit',
        org: 'testorg',
        site: 'testsite',
        repo: 'testsite',
        ref: 'feature/foo',
        branch: 'feature-foo',
        path: '/test/page',
      });
      expect(tokenCalls).to.equal(0);
    });

    it('keeps legacy behavior for empty and 1 rows', async function legacy() {
      this.timeout(8000);
      for (const sdk of [undefined, '', '1']) {
        const iframe = await openItem({ ...sdkItem, sdk });
        expect(iframe.hasAttribute('data-sdk2')).to.be.false;
        iframe.dispatchEvent(new Event('load'));
        await new Promise((r) => { setTimeout(r, 800); });
        expect(tokenCalls, `sdk=${sdk}`).to.be.greaterThan(0);
        expect(globalThis.__extHostCalls).to.have.length(0);
        tokenCalls = 0;
        el.remove();
      }
    });

    it('never sends the token when a loaded legacy iframe becomes an sdk2 row before the timer', async () => {
      const iframe = await openItem({ ...sdkItem, sdk: '1' });
      iframe.dispatchEvent(new Event('load'));
      iframe.setAttribute('data-sdk2', '');
      iframe.src = 'https://ext.example.com/other.html';
      await new Promise((r) => { setTimeout(r, 900); });

      expect(tokenCalls).to.equal(0);
    });

    it('hides rows with an invalid sdk value', async () => {
      const prevFetch = window.fetch;
      window.fetch = async (url) => {
        if (url.includes('/config/orgI/siteI')) {
          const data = [
            { title: 'Bad', path: 'https://example.com/b', sdk: 'x' },
            { title: 'Good', path: 'https://example.com/g', sdk: '2' },
          ];
          return new Response(JSON.stringify({ prepare: { data } }), { status: 200 });
        }
        if (url.includes('/config/orgI')) return new Response('{}', { status: 200 });
        return prevFetch(url);
      };
      const { warn } = console;
      const warnings = [];
      console.warn = (msg) => { warnings.push(msg); };
      try {
        el = await fixture({ details: createDetails({ org: 'orgI', site: 'siteI' }) });
      } finally {
        console.warn = warn;
        window.fetch = prevFetch;
      }
      const titles = el._menuItems.map((i) => i.title);
      expect(titles).to.include('Good');
      expect(titles).to.not.include('Bad');
      // loadMenu can run twice (details update + branchState replay), so check content, not count.
      expect(warnings).to.not.be.empty;
      expect(warnings.every((w) => w.includes('"Bad"'))).to.be.true;
    });

    it('closes the handle on fullsize dialog close', async () => {
      await openItem(sdkItem);
      const [{ handle }] = globalThis.__extHostCalls;
      el.handleCloseFullsizeDialog();
      await nextFrame();
      expect(handle.closed).to.equal(1);
    });

    it('closes the handle on da-dialog close', async () => {
      await openItem({ ...sdkItem, experience: undefined });
      expect(globalThis.__extHostCalls).to.have.length(1);
      const [{ handle }] = globalThis.__extHostCalls;
      el.handleCloseDialog();
      await nextFrame();
      expect(handle.closed).to.equal(1);
    });

    it('closes the handle on details change', async () => {
      await openItem(sdkItem);
      const [{ handle }] = globalThis.__extHostCalls;
      el.details = createDetails({ org: 'other', site: 'other' });
      await nextFrame();
      expect(handle.closed).to.be.greaterThan(0);
    });

    it('closes the handle on reset', async () => {
      await openItem(sdkItem);
      const [{ handle }] = globalThis.__extHostCalls;
      el.reset();
      expect(handle.closed).to.equal(1);
    });

    it('closes the handle on disconnect', async () => {
      await openItem(sdkItem);
      const [{ handle }] = globalThis.__extHostCalls;
      el.remove();
      expect(handle.closed).to.equal(1);
      expect(el._unsubBranch).to.be.null;
      expect(el._unsubComparison).to.be.null;
    });

    it('keeps the handle while a comparison temporarily hides the dialog', async () => {
      await openItem({ ...sdkItem, experience: undefined });
      const [{ handle }] = globalThis.__extHostCalls;
      el._comparison = 'open';

      el.handleCloseDialog();
      await nextFrame();

      expect(handle.closed).to.equal(0);
      expect(el._dialogItem).to.exist;
    });
  });

  describe('render', () => {
    it('renders nothing when menuItems are not loaded', async () => {
      el = document.createElement('prepare-menu');
      document.body.appendChild(el);
      await nextFrame();

      const popover = el.shadowRoot.querySelector('nx-popover');
      expect(popover).to.not.exist;
    });

    it('renders nx-popover once menu items are loaded', async () => {
      el = await fixture();

      const popover = el.shadowRoot.querySelector('nx-popover');
      expect(popover).to.exist;
    });

    it('renders a menu item button for each item', async () => {
      el = await fixture();

      const items = el.shadowRoot.querySelectorAll('.prepare-menu-item');
      expect(items.length).to.be.greaterThan(0);
    });

    it('renders menu items with correct titles', async () => {
      el = await fixture();

      const titles = [...el.shadowRoot.querySelectorAll('.prepare-menu-item span')]
        .map((s) => s.textContent);
      expect(titles).to.include('Unpublish');
    });

    it('renders items with role="menuitem"', async () => {
      el = await fixture();

      const items = el.shadowRoot.querySelectorAll('[role="menuitem"]');
      expect(items.length).to.be.greaterThan(0);
    });

    it('renders the container with role="menu"', async () => {
      el = await fixture();

      const menu = el.shadowRoot.querySelector('[role="menu"]');
      expect(menu).to.exist;
    });
  });

  describe('toggle', () => {
    it('calls popover.show when closed', async () => {
      el = await fixture();
      const popover = stubPopover(el);

      let showCalled = false;
      popover.show = () => { showCalled = true; };

      el.toggle(document.body);

      expect(showCalled).to.be.true;
    });

    it('calls popover.close when open', async () => {
      el = await fixture();
      const popover = stubPopover(el);
      popover.open = true;

      let closeCalled = false;
      popover.close = () => { closeCalled = true; };

      el.toggle(document.body);

      expect(closeCalled).to.be.true;
    });

    it('passes the anchor to popover.show', async () => {
      el = await fixture();
      const popover = stubPopover(el);

      const anchor = document.createElement('button');
      let receivedOpts;
      popover.show = (opts) => { receivedOpts = opts; };

      el.toggle(anchor);

      expect(receivedOpts.anchor).to.equal(anchor);
      expect(receivedOpts.placement).to.equal('below-end');
    });

    it('does nothing when popover is not in the DOM yet', () => {
      el = document.createElement('prepare-menu');
      document.body.appendChild(el);

      // _menuItems not set so render() returns nothing — no nx-popover in shadow DOM
      expect(() => el.toggle(document.body)).to.not.throw;
    });
  });

  describe('handleItemClick', () => {
    it('closes the popover', async () => {
      el = await fixture();
      const popover = stubPopover(el);
      popover.open = true;

      let closeCalled = false;
      popover.close = () => { closeCalled = true; };

      await el.handleItemClick({ title: 'Test', path: 'https://example.com' });

      expect(closeCalled).to.be.true;
    });

    it('sets _dialogItem for path-based items', async () => {
      el = await fixture();
      stubPopover(el);

      const item = { title: 'Custom', path: 'https://example.com/action' };
      await el.handleItemClick(item);

      expect(el._dialogItem).to.deep.equal(item);
    });

    it('sets _fullsizeDialogItem for fullsize-dialog items', async () => {
      el = await fixture();
      stubPopover(el);

      const item = {
        title: 'Large Custom',
        path: 'https://example.com/large',
        experience: 'fullsize-dialog',
      };
      await el.handleItemClick(item);

      expect(el._fullsizeDialogItem).to.deep.equal(item);
      expect(el._dialogItem).to.be.undefined;
    });

    it('sets _dialogItem with rendered cmp for render-based items', async () => {
      el = await fixture();
      stubPopover(el);

      const mockCmp = document.createElement('div');
      const item = { title: 'OOTB', render: async () => mockCmp };
      await el.handleItemClick(item);

      expect(el._dialogItem.title).to.equal('OOTB');
      expect(el._dialogItem.cmp).to.equal(mockCmp);
    });

    it('authenticates the same preview proxy origin the dialog iframe will load', async () => {
      el = await fixture({ details: createDetails({ org: 'orgf', site: 'sitef' }) });
      stubPopover(el);

      const savedAdobeIMS = window.adobeIMS;
      const savedNxIms = window.localStorage.getItem('nx-ims');
      window.localStorage.setItem('nx-ims', 'true');
      window.adobeIMS = { getAccessToken: () => ({ token: 'T1' }) };
      const prevFetch = window.fetch;
      const cookieRequests = [];
      window.fetch = async (url, opts) => {
        if (typeof url === 'string' && url.includes('/gimme_cookie')) {
          cookieRequests.push(url);
          return new Response('', { status: 200 });
        }
        return prevFetch(url, opts);
      };

      const item = {
        title: 'Large External',
        path: 'https://main--sitef--orgf.aem.live/tools/plugins/plugin/index.html',
        experience: 'fullsize-dialog',
      };

      try {
        await el.handleItemClick(item);
      } finally {
        window.fetch = prevFetch;
        if (savedAdobeIMS === undefined) {
          delete window.adobeIMS;
        } else {
          window.adobeIMS = savedAdobeIMS;
        }
        if (savedNxIms === null) window.localStorage.removeItem('nx-ims');
        else window.localStorage.setItem('nx-ims', savedNxIms);
      }

      expect(cookieRequests).to.deep.equal([
        'https://main--sitef--orgf.stage-preview.da.live/gimme_cookie',
      ]);
    });
  });

  describe('handleCloseDialog', () => {
    it('clears _dialogItem', async () => {
      el = await fixture();
      el._dialogItem = { title: 'Something' };

      el.handleCloseDialog();

      expect(el._dialogItem).to.be.undefined;
    });
  });

  describe('handleCloseFullsizeDialog', () => {
    it('clears _fullsizeDialogItem', async () => {
      el = await fixture();
      el._fullsizeDialogItem = { title: 'Something' };

      el.handleCloseFullsizeDialog();

      expect(el._fullsizeDialogItem).to.be.undefined;
    });
  });

  describe('_onPopoverClose', () => {
    it('dispatches a close event', async () => {
      el = await fixture();

      let fired = false;
      el.addEventListener('close', () => { fired = true; });

      el._onPopoverClose();

      expect(fired).to.be.true;
    });
  });

  describe('renderDialog', () => {
    it('renders nothing when no dialog item', async () => {
      el = await fixture();
      el._dialogItem = undefined;
      el.requestUpdate();
      await nextFrame();

      const dialog = el.shadowRoot.querySelector('da-dialog');
      expect(dialog).to.not.exist;
    });

    it('renders dialog with iframe for path-based items', async () => {
      el = await fixture();
      el._dialogItem = { title: 'External', path: 'https://example.com/action' };
      el.requestUpdate();
      await nextFrame();
      await nextFrame();

      const dialog = el.shadowRoot.querySelector('da-dialog');
      expect(dialog).to.exist;
      expect(dialog.querySelector('iframe').getAttribute('src')).to.equal('https://example.com/action');
    });

    it('renders dialog with component for render-based items', async () => {
      el = await fixture();
      const cmp = document.createElement('div');
      cmp.className = 'test-cmp';
      el._dialogItem = { title: 'OOTB', cmp };
      el.requestUpdate();
      await nextFrame();
      await nextFrame();

      const dialog = el.shadowRoot.querySelector('da-dialog');
      expect(dialog).to.exist;
      expect(dialog.querySelector('.test-cmp')).to.exist;
    });
  });

  describe('renderFullsizeDialog', () => {
    it('renders nothing when no fullsize dialog item', async () => {
      el = await fixture();
      el._fullsizeDialogItem = undefined;
      el.requestUpdate();
      await nextFrame();

      const dialog = el.shadowRoot.querySelector('.prepare-fullsize-dialog');
      expect(dialog).to.not.exist;
    });

    it('renders fullsize dialog with iframe for path-based items', async () => {
      el = await fixture();
      el._fullsizeDialogItem = {
        title: 'Large External',
        path: 'https://example.com/large',
        icon: '/blocks/edit/img/icon.svg#icon',
        experience: 'fullsize-dialog',
      };
      el.requestUpdate();
      await nextFrame();
      await nextFrame();

      const dialog = el.shadowRoot.querySelector('.prepare-fullsize-dialog');
      expect(dialog).to.exist;
      expect(dialog.getAttribute('aria-labelledby')).to.equal('prepare-fullsize-dialog-title');
      expect(dialog.querySelector('#prepare-fullsize-dialog-title').textContent.trim()).to.equal('Large External');
      expect(dialog.querySelector('.prepare-dialog-icon').getAttribute('aria-hidden')).to.equal('true');

      const iframe = dialog.querySelector('iframe');
      expect(iframe.getAttribute('src')).to.equal('https://example.com/large');
      expect(iframe.getAttribute('title')).to.equal('Large External');
    });
  });

  describe('renderIcon', () => {
    it('renders an svg use element for .svg icon paths', async () => {
      el = await fixture();
      el._menuItems = [{ title: 'Test', icon: '/blocks/edit/img/icon.svg#icon' }];
      el.requestUpdate();
      await nextFrame();
      await nextFrame();

      const use = el.shadowRoot.querySelector('.prepare-menu-item svg.icon use');
      expect(use).to.exist;
      expect(use.getAttribute('href')).to.equal('/blocks/edit/img/icon.svg#icon');
    });

    it('renders standalone SVG icon paths as img elements', async () => {
      el = await fixture();
      el._menuItems = [{ title: 'Test', icon: '/tools/plugins/request-for-publish/request-for-publish.svg' }];
      el.requestUpdate();
      await nextFrame();
      await nextFrame();

      const img = el.shadowRoot.querySelector('.prepare-menu-item img.icon');
      expect(img).to.exist;
      expect(img.getAttribute('src')).to.equal('/tools/plugins/request-for-publish/request-for-publish.svg');
    });

    it('renders an img element for non-svg icon paths', async () => {
      el = await fixture();
      el._menuItems = [{ title: 'Test', icon: 'https://example.com/icon.png' }];
      el.requestUpdate();
      await nextFrame();
      await nextFrame();

      const img = el.shadowRoot.querySelector('.prepare-menu-item img.icon');
      expect(img).to.exist;
      expect(img.getAttribute('src')).to.equal('https://example.com/icon.png');
    });
  });

  describe('details update', () => {
    it('resets and reloads menu when details change', async () => {
      el = await fixture();
      const firstItems = el._menuItems;

      el.details = createDetails({ org: 'neworg', site: 'newsite' });
      await waitForMenu();
      await nextFrame();

      expect(el._menuItems).to.not.equal(firstItems);
      expect(el._menuItems).to.be.an('array');
    });

    it('clears _dialogItem when details change', async () => {
      el = await fixture();
      el._dialogItem = { title: 'Something' };

      el.details = createDetails({ org: 'another', site: 'another' });
      await nextFrame();

      expect(el._dialogItem).to.be.undefined;
    });
  });

  describe('plugin messages', () => {
    const wait = (ms = 30) => new Promise((resolve) => { setTimeout(resolve, ms); });
    let comparisonContextKey;
    let savedIMS;
    let unsubscribe;

    before(async () => {
      ({ comparisonContextKey } = await import('../../../../../blocks/canvas/ew-comparison/comparison.js'));
    });

    beforeEach(() => {
      savedIMS = window.adobeIMS;
      window.adobeIMS = { getAccessToken: () => ({ token: 'T' }) };
    });

    afterEach(() => {
      unsubscribe?.();
      unsubscribe = undefined;
      window.adobeIMS = savedIMS;
    });

    // Resolves with the plugin's end of the channel once the 750 ms ready message is sent.
    function connectPlugin(element) {
      return new Promise((resolve) => {
        element.handleIframeLoad({
          target: {
            src: 'https://example.com/plugin.html',
            hasAttribute: () => false,
            contentWindow: { postMessage: (data, origin, ports) => resolve(ports[0]) },
          },
        });
      });
    }

    async function showDialog(element) {
      element._dialogItem = { title: 'Request publish', cmp: document.createElement('div') };
      await element.updateComplete;
      await wait(60);
      const daDialog = element.shadowRoot.querySelector('da-dialog');
      return { daDialog, slDialog: daDialog.shadowRoot.querySelector('sl-dialog') };
    }

    it('answers a save request through the comparison controller for the open page', async () => {
      el = await fixture({ details: createDetails({ path: '/test/page.html' }) });
      const port = await connectPlugin(el);
      unsubscribe = canvasBus.comparisonRequest.subscribe(({ action, context, resolve }) => {
        expect(action).to.equal('saveDocument');
        expect(comparisonContextKey(context))
          .to.equal(comparisonContextKey({ org: 'testorg', site: 'testsite', path: 'test/page' }));
        resolve({ ok: true });
      });
      const response = new Promise((resolve) => { port.onmessage = ({ data }) => resolve(data); });

      port.postMessage({ action: 'saveDocument', requestId: 'save-1' });

      expect(await response).to.deep.equal({ action: 'sdkResponse', requestId: 'save-1', result: { ok: true } });
    });

    it('forwards comparison requests and ignores saves without a request ID', async () => {
      el = await fixture();
      const port = await connectPlugin(el);
      const requests = [];
      const closed = new Promise((resolve) => {
        unsubscribe = canvasBus.comparisonRequest.subscribe((request) => {
          requests.push(request);
          if (request.action === 'closeComparison') resolve();
        });
      });

      port.postMessage({ action: 'saveDocument' });
      port.postMessage({ action: 'openComparison', details: { candidate: 'url', baseline: 'live' } });
      port.postMessage({ action: 'openComparison', details: { candidate: 'preview', baseline: 'live', path: '/other' } });
      port.postMessage({ action: 'closeComparison' });
      await closed;

      expect(requests.map(({ action }) => action)).to.deep.equal(['openComparison', 'closeComparison']);
      expect(requests[0].details).to.deep.equal({ candidate: 'preview', baseline: 'live' });
      expect(requests[0].context.path).to.equal('/test/page');
      expect(requests[0].resolve).to.equal(undefined);
    });

    it('stops routing plugin messages once the dialog closes', async () => {
      el = await fixture();
      const port = await connectPlugin(el);
      const requests = [];
      unsubscribe = canvasBus.comparisonRequest.subscribe(({ action }) => requests.push(action));

      el.handleCloseDialog();
      port.postMessage({ action: 'saveDocument', requestId: 'late' });
      await wait(50);

      expect(requests).to.deep.equal([]);
    });

    it('steps the dialog aside while the comparison it opened is shown', async () => {
      el = await fixture();
      const { daDialog, slDialog } = await showDialog(el);
      expect(slDialog.open).to.equal(true);
      const port = await connectPlugin(el);

      port.postMessage({ action: 'openComparison', details: { candidate: 'preview', baseline: 'live' } });
      await wait();
      canvasBus.comparisonState.emit({ open: true });

      expect(slDialog.open).to.equal(false);
      expect(el._dialogItem.title).to.equal('Request publish');
      expect(el.shadowRoot.querySelector('da-dialog')).to.equal(daDialog);

      canvasBus.comparisonState.emit({ open: false });

      expect(slDialog.open).to.equal(true);
      el.handleCloseDialog();
      expect(el._dialogItem).to.be.undefined;
    });

    it('leaves the dialog in place for a comparison it did not ask for', async () => {
      el = await fixture();
      const { slDialog } = await showDialog(el);
      await connectPlugin(el);

      canvasBus.comparisonState.emit({ open: true });

      expect(slDialog.open).to.equal(true);
    });

    it('steps a full-size dialog aside without unloading its plugin', async () => {
      el = await fixture();
      el._fullsizeDialogItem = { title: 'Request publish', path: '/test/fixtures/nx/public/sl/styles.css', experience: 'fullsize-dialog' };
      await el.updateComplete;
      const dialog = el.shadowRoot.querySelector('.prepare-fullsize-dialog');
      const iframe = dialog.querySelector('iframe');
      await new Promise((resolve) => { iframe.addEventListener('load', resolve, { once: true }); });
      const port = await connectPlugin(el);

      port.postMessage({ action: 'openComparison', details: { candidate: 'document', baseline: 'live' } });
      await wait();
      canvasBus.comparisonState.emit({ open: true });
      await wait();

      expect(dialog.open).to.equal(false);
      expect(iframe.isConnected).to.equal(true);
      expect(el._fullsizeDialogItem.title).to.equal('Request publish');

      canvasBus.comparisonState.emit({ open: false });

      expect(dialog.open).to.equal(true);
    });

    it('drops a dialog left behind an open comparison when another action is picked', async () => {
      el = await fixture();
      stubPopover(el);
      const { daDialog } = await showDialog(el);
      const port = await connectPlugin(el);
      port.postMessage({ action: 'openComparison', details: { candidate: 'preview', baseline: 'live' } });
      await wait();
      canvasBus.comparisonState.emit({ open: true });

      await el.handleItemClick({ title: 'Unpublish', render: async () => document.createElement('p') });
      await el.updateComplete;
      await wait(60);

      const next = el.shadowRoot.querySelector('da-dialog');
      expect(next).to.not.equal(daDialog);
      expect(next.shadowRoot.querySelector('sl-dialog').open).to.equal(true);
      expect(el._dialogItem.title).to.equal('Unpublish');
    });
  });
});
