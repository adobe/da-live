/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

// Wait for loadMenu (which awaits fetchDaConfigs) to finish
const waitForMenu = () => new Promise((resolve) => { setTimeout(resolve, 50); });

describe('PrepareMenu', () => {
  let PrepareMenu;
  let savedFetch;

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
      if (url.includes('/config/')) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    setNx('/test/fixtures/nx', { hostname: 'example.com' });

    const mod = await import('../../../../../blocks/canvas/editor-utils/prepare-menu.js');
    PrepareMenu = mod.default;
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
  });

  it('is defined as a custom element', () => {
    expect(customElements.get('prepare-menu')).to.exist;
  });

  it('is an instance of PrepareMenu', async () => {
    el = await fixture();
    expect(el).to.be.instanceOf(PrepareMenu);
  });

  describe('reset', () => {
    it('clears _menuItems and _dialogItem', async () => {
      el = await fixture();
      el._menuItems = [{ title: 'Test' }];
      el._dialogItem = { title: 'dialog' };

      el.reset();

      expect(el._menuItems).to.be.undefined;
      expect(el._dialogItem).to.be.undefined;
    });
  });

  describe('loadMenu', () => {
    it('loads non-optional OOTB actions by default', async () => {
      el = await fixture();

      const titles = el._menuItems.map((item) => item.title);
      expect(titles).to.include('Preflight');
      expect(titles).to.include('Unpublish');
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

    it('falls back to OOTB render for config items without path or render', async () => {
      const prevFetch = window.fetch;
      window.fetch = async (url) => {
        if (url.includes('/config/orgC/siteC')) {
          const body = { prepare: { data: [{ title: 'Preflight' }] } };
          return new Response(JSON.stringify(body), { status: 200 });
        }
        if (url.includes('/config/orgC')) {
          return new Response(JSON.stringify({}), { status: 200 });
        }
        return prevFetch(url);
      };

      el = await fixture({ details: createDetails({ org: 'orgC', site: 'siteC' }) });

      const preflight = el._menuItems.find((item) => item.title === 'Preflight');
      expect(preflight.render).to.be.a('function');

      window.fetch = prevFetch;
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
      expect(titles).to.include('Preflight');
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

    it('sets _dialogItem with rendered cmp for render-based items', async () => {
      el = await fixture();
      stubPopover(el);

      const mockCmp = document.createElement('div');
      const item = { title: 'OOTB', render: async () => mockCmp };
      await el.handleItemClick(item);

      expect(el._dialogItem.title).to.equal('OOTB');
      expect(el._dialogItem.cmp).to.equal(mockCmp);
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
});
