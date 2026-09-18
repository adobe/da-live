/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

// Wait for loadMenu (which awaits fetchDaConfigs) to finish
const waitForMenu = () => new Promise((resolve) => { setTimeout(resolve, 50); });

describe('DaPrepare', () => {
  let DaPrepare;
  let savedFetch;

  before(async () => {
    savedFetch = window.fetch;

    // Mock fetch for getSheet CSS, SVGs, and config endpoints
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
      // Config endpoints — return empty config by default
      if (url.includes('/config/')) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    setNx('/test/fixtures/nx', { hostname: 'example.com' });

    const mod = await import('../../../../../blocks/edit/da-prepare/da-prepare.js');
    DaPrepare = mod.default;
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
    const element = document.createElement('da-prepare');
    element.details = props.details || createDetails();
    document.body.appendChild(element);
    await waitForMenu();
    await nextFrame();
    return element;
  }

  afterEach(() => {
    if (el && el.parentElement) el.remove();
    el = null;
  });

  it('is defined as a custom element', () => {
    expect(customElements.get('da-prepare')).to.exist;
  });

  it('is an instance of DaPrepare', async () => {
    el = await fixture();
    expect(el).to.be.instanceOf(DaPrepare);
  });

  describe('reset', () => {
    it('clears internal state', async () => {
      el = await fixture();
      el._showMenu = true;
      el._menuItems = ['item'];
      el._dialogItem = { title: 'test' };

      el.reset();

      expect(el._showMenu).to.be.undefined;
      expect(el._menuItems).to.be.undefined;
      expect(el._dialogItem).to.be.undefined;
      expect(el._fullsizeDialogItem).to.be.undefined;
    });
  });

  describe('loadMenu', () => {
    it('loads non-optional OOTB actions by default', async () => {
      el = await fixture();
      await waitForMenu();

      expect(el._menuItems).to.be.an('array');
      const titles = el._menuItems.map((item) => item.title);
      expect(titles).to.include('Preflight');
      expect(titles).to.include('Unpublish');
    });

    it('excludes optional OOTB actions by default', async () => {
      el = await fixture();
      await waitForMenu();

      const titles = el._menuItems.map((item) => item.title);
      expect(titles).to.not.include('Schedule Publish');
      expect(titles).to.not.include('Send to Adobe Target');
    });

    it('includes optional OOTB actions when enabled by org config', async () => {
      const prevFetch = window.fetch;
      // Use unique org/site to avoid fetchDaConfigs cache
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
      await waitForMenu();

      const titles = el._menuItems.map((item) => item.title);
      expect(titles).to.include('Schedule Publish');

      window.fetch = prevFetch;
    });

    it('includes custom actions from site config', async () => {
      const prevFetch = window.fetch;
      // Use unique org/site to avoid fetchDaConfigs cache
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
      await waitForMenu();

      const titles = el._menuItems.map((item) => item.title);
      expect(titles).to.include('Custom Action');

      window.fetch = prevFetch;
    });

    it('preserves fullsize-dialog experience from custom actions', async () => {
      const prevFetch = window.fetch;
      // Use unique org/site to avoid fetchDaConfigs cache
      window.fetch = async (url) => {
        if (url.includes('/config/orgC/siteC')) {
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
        if (url.includes('/config/orgC')) {
          return new Response(JSON.stringify({}), { status: 200 });
        }
        return prevFetch(url);
      };

      el = await fixture({ details: createDetails({ org: 'orgC', site: 'siteC' }) });
      await waitForMenu();

      const item = el._menuItems.find(({ title }) => title === 'Large Action');
      expect(item.experience).to.equal('fullsize-dialog');

      window.fetch = prevFetch;
    });
  });

  describe('render', () => {
    it('renders nothing when menuItems is not loaded', async () => {
      el = document.createElement('da-prepare');
      document.body.appendChild(el);
      await nextFrame();

      const wrapper = el.shadowRoot.querySelector('.prepare-wrapper');
      expect(wrapper).to.not.exist;
    });

    it('renders toggle button when menu items are loaded', async () => {
      el = await fixture();

      const toggleBtn = el.shadowRoot.querySelector('.da-prepare-toggle');
      expect(toggleBtn).to.exist;
    });

    it('does not render menu by default', async () => {
      el = await fixture();

      const menu = el.shadowRoot.querySelector('.prepare-menu');
      expect(menu).to.not.exist;
    });
  });

  describe('handleToggle', () => {
    it('shows menu when toggled on', async () => {
      el = await fixture();

      el.handleToggle();
      el.requestUpdate();
      await nextFrame();
      await nextFrame();

      const menu = el.shadowRoot.querySelector('.prepare-menu');
      expect(menu).to.exist;
    });

    it('hides menu when toggled off', async () => {
      el = await fixture();

      el.handleToggle(); // open
      el.handleToggle(); // close
      el.requestUpdate();
      await nextFrame();
      await nextFrame();

      const menu = el.shadowRoot.querySelector('.prepare-menu');
      expect(menu).to.not.exist;
    });

    it('toggles _showMenu state', async () => {
      el = await fixture();

      el.handleToggle();
      expect(el._showMenu).to.be.true;

      el.handleToggle();
      expect(el._showMenu).to.be.false;
    });
  });

  describe('renderPrepareMenu', () => {
    it('renders menu items with titles', async () => {
      el = await fixture();

      el._showMenu = true;
      el.requestUpdate();
      await nextFrame();
      await nextFrame();

      const items = el.shadowRoot.querySelectorAll('.prepare-menu-item');
      expect(items.length).to.be.greaterThan(0);

      const titles = [...items].map((item) => item.querySelector('span').textContent);
      expect(titles).to.include('Preflight');
      expect(titles).to.include('Unpublish');
    });

    it('renders SVG icons for items with .svg paths', async () => {
      el = await fixture();

      el._showMenu = true;
      el.requestUpdate();
      await nextFrame();
      await nextFrame();

      const svgIcons = el.shadowRoot.querySelectorAll('.prepare-menu-item svg.icon');
      expect(svgIcons.length).to.be.greaterThan(0);
    });

    it('renders standalone SVG icon paths as images', async () => {
      el = await fixture();

      el._showMenu = true;
      el._menuItems = [{ title: 'Test', icon: '/tools/plugins/request-for-publish/request-for-publish.svg' }];
      el.requestUpdate();
      await nextFrame();
      await nextFrame();

      const img = el.shadowRoot.querySelector('.prepare-menu-item img.icon');
      expect(img).to.exist;
      expect(img.getAttribute('src')).to.equal('/tools/plugins/request-for-publish/request-for-publish.svg');
    });
  });

  describe('handleItemClick', () => {
    it('closes the menu', async () => {
      el = await fixture();
      el._showMenu = true;

      const item = { title: 'Test', path: 'https://example.com' };
      await el.handleItemClick(item);

      expect(el._showMenu).to.be.false;
    });

    it('sets dialogItem for path-based items', async () => {
      el = await fixture();

      const item = { title: 'Custom', path: 'https://example.com/action' };
      await el.handleItemClick(item);

      expect(el._dialogItem).to.deep.equal(item);
    });

    it('sets fullsizeDialogItem for fullsize-dialog items', async () => {
      el = await fixture();

      const item = {
        title: 'Large Custom',
        path: 'https://example.com/large',
        experience: 'fullsize-dialog',
      };
      await el.handleItemClick(item);

      expect(el._fullsizeDialogItem).to.deep.equal(item);
      expect(el._dialogItem).to.be.undefined;
    });

    it('sets dialogItem with rendered cmp for render-based items', async () => {
      el = await fixture();

      const mockCmp = document.createElement('div');
      const item = {
        title: 'OOTB Action',
        render: async () => mockCmp,
      };
      await el.handleItemClick(item);

      expect(el._dialogItem.title).to.equal('OOTB Action');
      expect(el._dialogItem.cmp).to.equal(mockCmp);
    });
  });

  describe('handleCloseDialog', () => {
    it('clears the dialog item', async () => {
      el = await fixture();
      el._dialogItem = { title: 'Something' };

      el.handleCloseDialog();

      expect(el._dialogItem).to.be.undefined;
    });

    it('emits a cancelled status when a gate request is active', async () => {
      el = await fixture();
      el._dialogItem = { title: 'Preflight' };
      el._preflightRequestId = 'req-close';

      let detail;
      const onStatus = (e) => { detail = e.detail; };
      document.addEventListener('nx-preflight-status', onStatus);
      el.handleCloseDialog();
      document.removeEventListener('nx-preflight-status', onStatus);

      expect(detail).to.deep.equal({
        path: '/testorg/testsite/test/page',
        status: 'cancelled',
        requestId: 'req-close',
      });
      expect(el._dialogItem).to.be.undefined;
      expect(el._preflightRequestId).to.be.undefined;
    });

    it('does not emit a status for a manually opened dialog (no request id)', async () => {
      el = await fixture();
      el._dialogItem = { title: 'Preflight' };
      el._preflightRequestId = undefined;

      let fired = false;
      const onStatus = () => { fired = true; };
      document.addEventListener('nx-preflight-status', onStatus);
      el.handleCloseDialog();
      document.removeEventListener('nx-preflight-status', onStatus);

      expect(fired).to.be.false;
      expect(el._dialogItem).to.be.undefined;
    });
  });

  describe('handleCloseFullsizeDialog', () => {
    it('clears the fullsize dialog item', async () => {
      el = await fixture();
      el._fullsizeDialogItem = { title: 'Something' };

      el.handleCloseFullsizeDialog();

      expect(el._fullsizeDialogItem).to.be.undefined;
    });
  });

  describe('renderDialog', () => {
    it('renders nothing when no dialog item', async () => {
      el = await fixture();
      el._dialogItem = undefined;
      el.requestUpdate();
      await nextFrame();
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

      const iframe = dialog.querySelector('iframe');
      expect(iframe).to.exist;
      expect(iframe.getAttribute('src')).to.equal('https://example.com/action');
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
      await nextFrame();

      const dialog = el.shadowRoot.querySelector('.prepare-fullsize-dialog');
      expect(dialog).to.not.exist;
    });

    it('renders fullsize dialog with iframe for path-based items', async () => {
      el = await fixture();
      el._fullsizeDialogItem = {
        title: 'Large External',
        path: 'https://example.com/large',
        experience: 'fullsize-dialog',
      };
      el.requestUpdate();
      await nextFrame();
      await nextFrame();

      const dialog = el.shadowRoot.querySelector('.prepare-fullsize-dialog');
      expect(dialog).to.exist;
      expect(dialog.getAttribute('aria-labelledby')).to.equal('prepare-fullsize-dialog-title');
      expect(dialog.querySelector('#prepare-fullsize-dialog-title').textContent.trim()).to.equal('Large External');

      const iframe = dialog.querySelector('iframe');
      expect(iframe).to.exist;
      expect(iframe.getAttribute('src')).to.equal('https://example.com/large');
      expect(iframe.getAttribute('title')).to.equal('Large External');
    });
  });

  describe('handleOutsideClick', () => {
    it('closes menu when clicking outside', async () => {
      el = await fixture();
      el._showMenu = true;

      // Simulate click outside — composedPath won't include el
      const event = { composedPath: () => [] };
      el.handleOutsideClick(event);

      expect(el._showMenu).to.be.false;
    });

    it('does not close menu when clicking inside', async () => {
      el = await fixture();
      el._showMenu = true;

      const event = { composedPath: () => [el] };
      el.handleOutsideClick(event);

      expect(el._showMenu).to.be.true;
    });
  });

  describe('renderIcon', () => {
    it('renders svg use element for .svg icon paths', async () => {
      el = await fixture();

      el._showMenu = true;
      el._menuItems = [{ title: 'Test', icon: '/blocks/edit/img/icon.svg#icon' }];
      el.requestUpdate();
      await nextFrame();
      await nextFrame();

      const svg = el.shadowRoot.querySelector('.prepare-menu-item svg.icon use');
      expect(svg).to.exist;
      expect(svg.getAttribute('href')).to.equal('/blocks/edit/img/icon.svg#icon');
    });

    it('renders standalone SVG icon paths as img elements', async () => {
      el = await fixture();

      el._showMenu = true;
      el._menuItems = [{ title: 'Test', icon: '/tools/plugins/request-for-publish/request-for-publish.svg' }];
      el.requestUpdate();
      await nextFrame();
      await nextFrame();

      const img = el.shadowRoot.querySelector('.prepare-menu-item img.icon');
      expect(img).to.exist;
      expect(img.getAttribute('src')).to.equal('/tools/plugins/request-for-publish/request-for-publish.svg');
    });

    it('renders img element for non-svg icon paths', async () => {
      el = await fixture();

      el._showMenu = true;
      el._menuItems = [{ title: 'Test', icon: 'https://example.com/icon.png' }];
      el.requestUpdate();
      await nextFrame();
      await nextFrame();

      const img = el.shadowRoot.querySelector('.prepare-menu-item img.icon');
      expect(img).to.exist;
      expect(img.getAttribute('src')).to.equal('https://example.com/icon.png');
    });
  });

  describe('preflight dialog lifecycle', () => {
    it('closes the gate-triggered dialog on success', async () => {
      el = await fixture();
      el._preflightRequestId = 'req-1';
      el._dialogItem = { title: 'Preflight' };
      document.dispatchEvent(new CustomEvent('nx-preflight-status', { detail: { requestId: 'req-1', status: 'success' } }));
      expect(el._dialogItem).to.be.undefined;
      expect(el._preflightRequestId).to.be.undefined;
    });

    it('keeps the dialog open on failure', async () => {
      el = await fixture();
      el._preflightRequestId = 'req-2';
      el._dialogItem = { title: 'Preflight' };
      document.dispatchEvent(new CustomEvent('nx-preflight-status', { detail: { requestId: 'req-2', status: 'fail' } }));
      expect(el._dialogItem).to.not.be.undefined;
    });

    it('ignores a status with a different requestId', async () => {
      el = await fixture();
      el._preflightRequestId = 'req-3';
      el._dialogItem = { title: 'Preflight' };
      document.dispatchEvent(new CustomEvent('nx-preflight-status', { detail: { requestId: 'other', status: 'success' } }));
      expect(el._dialogItem).to.not.be.undefined;
    });

    it('does not auto-close a manually opened dialog (no request id)', async () => {
      el = await fixture();
      el._preflightRequestId = undefined;
      el._dialogItem = { title: 'Preflight' };
      document.dispatchEvent(new CustomEvent('nx-preflight-status', { detail: { status: 'success' } }));
      expect(el._dialogItem).to.not.be.undefined;
    });
  });
});
