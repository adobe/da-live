import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import initBrowse from '../../../../blocks/browse/browse.js';
import initLanding from '../../../../blocks/landing/landing.js';
import { getNx, getNx2Api } from '../../../../scripts/utils.js';

const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const { setImsResult } = await import(`${getNx()}/utils/ims.js`);
const { config, source, loadIms, handleSignIn } = await getNx2Api();

describe('Browse authored Landing tiles', () => {
  const storage = Object.getOwnPropertyDescriptor(window, 'localStorage');
  let container;
  let subscribe;
  let href;
  let observers;

  const whenMounted = (selector) => new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const component = container.querySelector(selector);
      if (!component) return;
      observer.disconnect();
      resolve(component);
    });
    observers.push(observer);
    observer.observe(container, { childList: true, subtree: true });
  });

  before(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: window.sessionStorage });
  });
  after(() => { Object.defineProperty(window, 'localStorage', storage); });

  beforeEach(() => {
    observers = [];
    href = window.location.href;
    const url = new URL(href);
    url.searchParams.delete('landing');
    url.hash = '';
    window.history.replaceState(null, '', url);
    setImsResult({});
    loadIms.reset();
    loadIms.resolves({ accessToken: { token: 'test-token' } });
    handleSignIn.resetHistory();
    hashChange._set(undefined);
    subscribe = sinon.spy(hashChange, 'subscribe');
    sinon.stub(config, 'get').resolves({ ok: false, status: 404 });
    sinon.stub(source, 'list').resolves({ ok: true, items: [] });
    sinon.stub(window, 'fetch').resolves(new Response('{}'));
    localStorage.setItem('da-sites', JSON.stringify(['org/site', 'org/other']));
    container = document.createElement('main');
    document.body.append(container);
  });

  afterEach(() => {
    observers.forEach((observer) => observer.disconnect());
    subscribe.returnValues.forEach((unsubscribe) => unsubscribe());
    container.remove();
    sinon.restore();
    hashChange._set(undefined);
    setImsResult(undefined);
    loadIms.reset();
    loadIms.resolves({ accessToken: { token: 'test-token' } });
    handleSignIn.resetHistory();
    localStorage.removeItem('da-sites');
    window.history.replaceState(null, '', href);
  });

  [false, true].forEach((separateSection) => {
    it(`slots and reuses authored tiles from ${separateSection ? 'separate sections' : 'one section'}`, async () => {
      container.innerHTML = `<div class="section"><div class="browse"></div></div>
        <div class="section"><div class="greeting"><div><div><h1>Welcome</h1></div></div></div>
        ${separateSection ? '</div><div class="section">' : ''}
        <div class="landing">
          <div><div>:s2-icon-folderopen-20-n:</div>
            <div><h3><a href="/#/aem-sandbox/block-collection">Sandbox</a></h3><p>Explore sample blocks</p></div></div>
          <div><div>:s2-icon-publish-20-n:</div>
            <div><h3><a href="https://example.com/guide">Guide</a></h3></div></div>
        </div><p data-neighbor>Keep neighboring content</p></div>
        <div class="section"><p data-keep>Unrelated content</p></div>`;
      const browse = container.querySelector('.browse');
      const authoredGreeting = container.querySelector('.greeting');
      const authoredLanding = container.querySelector('.landing');
      const mounted = whenMounted('da-landing-tiles');
      initBrowse(browse);
      const tiles = await mounted;
      const greeting = await authoredGreeting.initialized;
      const sites = browse.querySelector('da-sites');
      await sites.updateComplete;
      await tiles.updateComplete;
      expect(sites.querySelector('da-greeting')).to.equal(greeting);
      expect(sites.querySelector('da-landing-tiles')).to.equal(tiles);
      expect(tiles.slot).to.equal('tiles');
      expect(sites.shadowRoot.querySelector('slot[name="tiles"]')).not.to.equal(null);
      expect(sites.shadowRoot.querySelector('.da-double-card')).to.equal(null);
      expect(sites.shadowRoot.querySelectorAll('.da-site-outer')).to.have.length(2);
      expect(container.querySelector('[data-neighbor]')).not.to.equal(null);
      expect(container.querySelector('[data-keep]')).not.to.equal(null);
      expect(initLanding(authoredLanding)).to.equal(tiles);
      expect(tiles.isConnected).to.equal(true);
      sites.handleRemove(sites._recents[0]);
      sites.handleRemove(sites._recents[0]);
      await sites.updateComplete;
      expect(sites.shadowRoot.querySelector('.da-no-site-well')).not.to.equal(null);
      expect(sites.shadowRoot.querySelector('.da-double-card')).to.equal(null);
      expect([...tiles.shadowRoot.querySelectorAll('a')].map((link) => link.getAttribute('href')))
        .to.deep.equal(['/#/aem-sandbox/block-collection', 'https://example.com/guide']);
      const navigation = whenMounted('da-browse');
      hashChange._set({ org: 'org', site: 'returned', fullpath: '/org/returned' });
      await navigation;
      const returning = whenMounted('da-landing-tiles');
      hashChange._set(undefined);
      await returning;
      const returned = browse.querySelector('da-sites');
      await returned.updateComplete;
      expect(returned.querySelectorAll('da-landing-tiles')).to.have.length(1);
      expect(returned.querySelector('da-landing-tiles')).to.equal(tiles);
      expect(returned.querySelector('da-greeting')).to.equal(greeting);
    });
  });

  [undefined, '', '<div><div>Invalid tile</div></div>'].forEach((content, index) => {
    it(`keeps the existing cards without valid authored tiles (${index})`, async () => {
      const warn = sinon.stub(console, 'warn');
      container.innerHTML = `<div class="section"><div class="browse"></div></div>
        <div class="section"><div class="greeting"><div><div><h1>Welcome</h1></div></div></div>
        ${content === undefined ? '' : `<div class="landing">${content}</div>`}
        <p data-keep>Keep existing content</p></div>`;
      const mounted = whenMounted('da-greeting');
      initBrowse(container.querySelector('.browse'));
      await mounted;
      const sites = container.querySelector('da-sites');
      await sites.updateComplete;
      expect(sites.shadowRoot.querySelector('.da-double-card-sandbox')).not.to.equal(null);
      expect(sites.shadowRoot.querySelector('.da-double-card-add-new')).not.to.equal(null);
      expect(sites.querySelector('da-landing-tiles')).to.equal(null);
      expect(sites.shadowRoot.querySelector('slot[name="tiles"]')).to.equal(null);
      expect(container.querySelector('[data-keep]')).not.to.equal(null);
      expect(warn.called).to.equal(index === 2);
    });
  });

  it('shows authored tiles on a first visit without a greeting or sign-in', async () => {
    localStorage.removeItem('da-sites');
    container.innerHTML = `<div class="section"><div class="browse"></div></div>
      <div class="section"><div class="landing"><div>
        <div>:s2-icon-add-20-n:</div>
        <div><h3><a href="/start">Add a site</a></h3></div>
      </div></div></div>`;
    const mounted = whenMounted('da-landing-tiles');
    initBrowse(container.querySelector('.browse'));
    const tiles = await mounted;
    const sites = container.querySelector('da-sites');
    await sites.updateComplete;
    await tiles.updateComplete;
    expect(sites.shadowRoot.querySelector('form')).not.to.equal(null);
    expect(sites.shadowRoot.querySelector('slot[name="tiles"]')).not.to.equal(null);
    expect(sites.shadowRoot.querySelector('.da-double-card')).to.equal(null);
    expect(tiles.shadowRoot.querySelector('a').getAttribute('href')).to.equal('/start');
    expect(loadIms.called).to.equal(false);
    expect(handleSignIn.called).to.equal(false);
  });
});
