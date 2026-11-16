import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import initBrowse from '../../../../blocks/browse/browse.js';
import initLanding from '../../../../blocks/landing/landing.js';
import { getNx, getNx2Api } from '../../../../scripts/utils.js';

const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const { setImsResult } = await import(`${getNx()}/utils/ims.js`);
const { config, source } = await getNx2Api();

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
    hashChange._set(undefined);
    subscribe = sinon.spy(hashChange, 'subscribe');
    sinon.stub(config, 'get').resolves({ ok: false, status: 404 });
    sinon.stub(source, 'list').resolves({ ok: true, items: [] });
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
    localStorage.removeItem('da-sites');
    window.history.replaceState(null, '', href);
  });

  [false, true].forEach((separateSection) => {
    it(`slots and reuses the original authored blocks from ${separateSection ? 'separate sections' : 'one section'}`, async () => {
      container.innerHTML = `<div class="section"><div class="browse"></div></div>
        <div class="section"><div class="greeting"><div><div><h1>Welcome</h1></div></div></div>
        ${separateSection ? '</div><div class="section">' : ''}
        <div class="landing">
          <div><div>:s2-icon-folderopen-20-n:</div>
            <div><h3><a href="/#/aem-sandbox/block-collection">Sandbox</a></h3><p>Explore sample blocks</p></div></div>
          <div><div>:s2-icon-publish-20-n:</div>
            <div><h3><a href="https://example.com/guide">Guide</a></h3></div></div>
        </div></div><div class="section"><p data-keep>Unrelated content</p></div>`;
      const browse = container.querySelector('.browse');
      const authoredGreeting = container.querySelector('.greeting');
      const authoredLanding = container.querySelector('.landing');
      const mounted = whenMounted('da-sites');
      initBrowse(browse);
      const sites = await mounted;
      await sites.updateComplete;
      const tiles = authoredLanding.initialized;
      const greeting = await authoredGreeting.initialized;
      await tiles.updateComplete;
      expect(sites.querySelector('da-greeting')).to.equal(greeting);
      expect(sites.querySelector('da-landing-tiles')).to.equal(tiles);
      expect(tiles.slot).to.equal('tiles');
      expect(container.querySelector('[data-keep]')).not.to.equal(null);
      const files = sites.shadowRoot.querySelector('da-recent-files');
      const tileSection = sites.shadowRoot.querySelector('.da-site-tiles');
      expect(files.nextElementSibling).to.equal(tileSection);
      expect(new URL(tiles.shadowRoot.querySelector('a').href).hash).to.equal('#/aem-sandbox/block-collection');
      expect(initLanding(authoredLanding)).to.equal(tiles);
      expect(tiles.isConnected).to.equal(true);
      sites.handleRemove(sites._recents[0]);
      await sites.updateComplete;
      await tiles.updateComplete;
      expect(new URL(tiles.shadowRoot.querySelector('a').href).hash).to.equal('#/aem-sandbox/block-collection');
      sites.handleRemove(sites._recents[0]);
      await sites.updateComplete;
      await tiles.updateComplete;
      expect([...tiles.shadowRoot.querySelectorAll('a')].map((link) => link.getAttribute('href')))
        .to.deep.equal(['/#/aem-sandbox/block-collection', 'https://example.com/guide']);
      expect(sites.shadowRoot.querySelector('.da-no-site-well').nextElementSibling).to.equal(tileSection);
      const navigation = whenMounted('da-browse');
      hashChange._set({ org: 'org', site: 'returned', fullpath: '/org/returned' });
      await navigation;
      const returning = whenMounted('da-sites');
      hashChange._set(undefined);
      const returned = await returning;
      await returned.updateComplete;
      await tiles.updateComplete;
      expect(returned.querySelectorAll('da-landing-tiles')).to.have.length(1);
      expect(returned.querySelector('da-landing-tiles')).to.equal(tiles);
      expect(returned.querySelector('da-greeting')).to.equal(greeting);
      expect(new URL(tiles.shadowRoot.querySelector('a').href).hash).to.equal('#/aem-sandbox/block-collection');
    });
  });
});
