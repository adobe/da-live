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
      el._actions = { open: true };

      el.reset();

      expect(el._scheduled).to.be.undefined;
      expect(el._configs).to.be.undefined;
      expect(el._actions).to.deep.equal({});
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
    it('sets status and updates icon classes', async () => {
      el = await fixture();

      const icon = document.createElement('div');
      icon.classList.add('is-sending');
      const parent = document.createElement('div');
      parent.appendChild(icon);

      const json = { error: { message: 'Not authorized', status: 403 } };
      el.handleError(json, 'preview', icon);

      expect(el._status.message).to.equal('Not authorized');
      expect(el._status.status).to.equal(403);
      expect(el._status.action).to.equal('preview');
      expect(icon.classList.contains('is-sending')).to.be.false;
      expect(parent.classList.contains('is-error')).to.be.true;
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

    it('excludes publish when hidePublish config matches path', async () => {
      el = await fixture({
        details: createDetails({
          view: 'edit',
          path: '/test/page',
          fullpath: '/testorg/testsite/test/page',
        }),
      });
      el._configs = [{ key: 'editor.hidePublish', value: '/testorg/testsite/test' }];
      const actions = await el.getAvailableActions();
      expect(actions).to.not.include('publish');
      expect(actions).to.include('preview');
    });

    it('returns no preview/publish when no path', async () => {
      el = await fixture({ details: createDetails({ view: 'edit', path: '' }) });
      el._configs = [];
      const actions = await el.getAvailableActions();
      expect(actions).to.not.include('preview');
      expect(actions).to.not.include('publish');
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
});
