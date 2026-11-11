import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-landing.js';
import init from '../../../../blocks/browse/browse.js';
import { DaLanding } from '../../../../blocks/landing/landing.js';
import { DaRecentFiles } from '../../../../blocks/recent-files/recent-files.js';
import { getNx, getNx2, getNx2Api } from '../../../../scripts/utils.js';

const { hashChange, loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { source, config } = await getNx2Api();
const { getSiteOptions } = await import(`${getNx2()}/blocks/siteselector/site-utils.js`);
const content = await fetch('/test/fixtures/landing-tiles.html').then((response) => response.text());

async function waitUntil(predicate) {
  for (let i = 0; i < 50 && !predicate(); i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  expect(!!predicate()).to.equal(true);
}

describe('Browse Content opt-in', () => {
  // Each init subscribes to hash changes; drop them so later hash updates don't reach old views.
  let subscribe;
  let initialize;
  let loadSite;
  beforeEach(() => {
    subscribe = sinon.spy(hashChange, 'subscribe');
    initialize = sinon.spy(DaLanding.prototype, 'initialize');
    loadSite = sinon.stub(DaRecentFiles.prototype, 'loadSite').resolves();
    getSiteOptions.returns([{ value: 'org/site', label: 'org/site' }]);
    localStorage.setItem('da-sites', JSON.stringify(['org/site']));
  });
  afterEach(() => {
    subscribe.returnValues.forEach((unsubscribe) => unsubscribe());
    subscribe.restore();
    initialize.restore();
    loadSite.restore();
    getSiteOptions.reset();
    getSiteOptions.returns([]);
    localStorage.removeItem('da-sites');
    hashChange._set(undefined);
  });

  it('switches between site Browse and Content without reloading and keeps nav selection off the URL', async () => {
    await import('../../../../blocks/browse/v2/da-browse/da-browse.js');
    const { href } = window.location;
    const main = document.createElement('main');
    main.innerHTML = content.replace(/<\/?main>/g, '');
    const ordinary = main.querySelector('.browse');
    const browse = document.createElement('da-browse');
    const details = { org: 'org', site: 'site', fullpath: '/org/site' };
    browse.details = details;
    ordinary.replaceChildren(browse);
    document.body.append(main);
    const list = sinon.stub(source, 'list').callsFake(async (fullpath) => ({
      ok: true,
      items: [{ name: 'page', path: `${fullpath}/page.html`, ext: 'html' }],
    }));
    const configs = sinon.stub(config, 'get').resolves({ ok: true, json: async () => ({ data: [] }) });
    const fetch = sinon.stub(window, 'fetch').resolves(new Response(content));
    const observers = [];
    const whenMounted = (selector, root = ordinary) => new Promise((resolve) => {
      let observer;
      const finish = () => {
        const component = root.querySelector(selector);
        if (!component) return;
        observer.disconnect();
        resolve(component);
      };
      observer = new MutationObserver(finish);
      observer.observe(root, { childList: true, subtree: true });
      observers.push(observer);
      finish();
    });
    try {
      const url = new URL(href);
      url.searchParams.set('landing', 'true');
      url.hash = '/org/site';
      window.history.replaceState(null, '', url);
      hashChange._set(details);
      await init(ordinary);
      expect(ordinary.firstElementChild).to.equal(browse);
      expect(browse.details.site).to.equal('site');
      expect(ordinary.querySelector('da-landing')).to.equal(null);
      url.hash = '';
      window.history.replaceState(null, '', url);
      const mounted = whenMounted('da-landing');
      hashChange._set(undefined);
      const landing = await mounted;
      await initialize.lastCall.returnValue;
      await landing.updateComplete;
      expect(ordinary.querySelector('da-browse')).to.equal(null);
      expect(ordinary.firstElementChild.className).to.equal('landing');
      const tiles = await whenMounted('da-landing-tiles');
      await waitUntil(() => tiles.entries);
      await tiles.updateComplete;
      expect(ordinary.firstElementChild.firstElementChild).to.equal(landing);
      expect(landing.localName).to.equal('da-landing');
      expect(landing.path).to.equal('/org/site');
      const { href: rootHref } = window.location;
      expect(landing.shadowRoot.querySelector('nx-siteselector')).to.equal(null);
      const selection = sinon.spy(landing, 'setScope');
      document.dispatchEvent(new CustomEvent('site-select', { detail: { value: 'another/site' } }));
      await selection.returnValues[0];
      await landing.updateComplete;
      expect(landing.path).to.equal('/another/site');
      await tiles.updateComplete;
      const tile = tiles.shadowRoot.querySelector('da-landing-tile');
      await tile.updateComplete;
      expect(new URL(tile.href).hash).to.equal('#/another/site');
      expect(window.location.href).to.equal(rootHref);
      expect(landing.querySelector('da-recent-files').shadowRoot.querySelector('.files-panel')).not.to.equal(null);
      expect(landing.shadowRoot.querySelector('h1, textarea, .composer')).to.equal(null);
      url.hash = '/org/other';
      window.history.replaceState(null, '', url);
      const returning = whenMounted('da-browse');
      const nextDetails = { org: 'org', site: 'other', fullpath: '/org/other' };
      hashChange._set(nextDetails);
      const returned = await returning;
      await returned.updateComplete;
      expect(returned.details).to.deep.equal(nextDetails);
      await whenMounted('.da-browse-content', returned.shadowRoot);
      const returnedList = returned.shadowRoot.querySelector('da-list');
      const item = await whenMounted('da-file-item', returnedList.shadowRoot);
      expect(item.path).to.equal('/org/other/page.html');
      expect(ordinary.querySelector('da-landing')).to.equal(null);
    } finally {
      observers.forEach((observer) => observer.disconnect());
      main.remove();
      list.restore();
      configs.restore();
      fetch.restore();
      window.history.replaceState(null, '', href);
      localStorage.removeItem('da-sites');
    }
  });

  it('hands Browse its path only after the Browse stylesheet is adopted', async () => {
    const { href } = window.location;
    const el = document.createElement('div');
    const browse = document.createElement('da-browse');
    const browseHref = new URL('../../../../blocks/browse/browse.js', import.meta.url).href;
    const browseSheet = new CSSStyleSheet();
    let adoptBrowseSheet;
    loadStyle._set(browseHref, new Promise((resolve) => { adoptBrowseSheet = resolve; }));
    // Isolate stylesheet ordering from the component's own rendering and data loading.
    browse.render = () => '';
    let received;
    let adoptedAtUpdate;
    let resolveDetails;
    const detailsReady = new Promise((resolve) => { resolveDetails = resolve; });
    Object.defineProperty(browse, 'details', {
      configurable: true,
      set(details) {
        received = details;
        adoptedAtUpdate = document.adoptedStyleSheets.includes(browseSheet);
        resolveDetails();
      },
    });
    el.append(browse);
    document.body.append(el);
    try {
      const url = new URL(href);
      url.searchParams.delete('landing');
      url.hash = '/org';
      window.history.replaceState(null, '', url);
      hashChange._set({ org: 'org' });
      init(el);
      await new Promise((resolve) => { setTimeout(resolve); });
      expect(received).to.equal(undefined);
      expect(document.adoptedStyleSheets.includes(browseSheet)).to.equal(false);
      adoptBrowseSheet(browseSheet);
      await detailsReady;
      expect(received).to.deep.equal({ org: 'org' });
      expect(adoptedAtUpdate).to.equal(true);
    } finally {
      // Settle pending component setup before removing the stylesheet.
      adoptBrowseSheet(browseSheet);
      await detailsReady;
      loadStyle._set(browseHref);
      document.adoptedStyleSheets = document.adoptedStyleSheets
        .filter((sheet) => sheet !== browseSheet);
      el.remove();
      window.history.replaceState(null, '', href);
    }
  });
  it('mounts one tile group inside the gated landing when updates overlap', async () => {
    const { href } = window.location;
    const main = document.createElement('main');
    main.innerHTML = content.replace(/<\/?main>/g, '');
    const el = main.querySelector('.browse');
    el.innerHTML = '<picture></picture>';
    document.body.append(main);
    const fetchContent = sinon.spy(window, 'fetch');
    let observer;
    try {
      const url = new URL(href);
      url.searchParams.set('landing', 'true');
      window.history.replaceState(null, '', url);
      hashChange._set(undefined);
      const mounted = new Promise((resolve) => {
        observer = new MutationObserver(() => {
          const tiles = el.querySelector('da-landing-tiles');
          if (!tiles) return;
          observer.disconnect();
          resolve(tiles);
        });
        observer.observe(el, { childList: true, subtree: true });
      });
      init(el);
      hashChange._set(undefined);
      const tiles = await mounted;
      await waitUntil(() => tiles.entries);
      await tiles.updateComplete;
      await new Promise((resolve) => { setTimeout(resolve, 50); });
      expect(el.children).to.have.length(1);
      expect(el.querySelectorAll('da-landing-tiles')).to.have.length(1);
      expect(tiles.parentElement.className).to.equal('landing');
      expect(el.querySelector('picture, da-sites, da-browse')).to.equal(null);
      expect(tiles.shadowRoot.querySelectorAll('da-landing-tile')).to.have.length(5);
      expect(fetchContent.called).to.equal(false);
    } finally {
      fetchContent.restore();
      observer?.disconnect();
      main.remove();
      window.history.replaceState(null, '', href);
    }
  });

  it('renders the page’s own Landing table with the preselected site on unscoped Home', async () => {
    const main = document.createElement('main');
    main.innerHTML = content.replace(/<\/?main>/g, '');
    const el = main.querySelector('.browse');
    const block = main.querySelector('.landing');
    document.body.append(main);
    const fetchContent = sinon.spy(window, 'fetch');
    try {
      init(el);
      await waitUntil(() => el.querySelector('da-landing-tiles')?.entries);
      const tiles = el.querySelector('da-landing-tiles');
      await tiles.updateComplete;
      const all = [...tiles.shadowRoot.querySelectorAll('da-landing-tile')];
      await Promise.all(all.map((tile) => tile.updateComplete));
      const [browse, create, ...docs] = all;
      expect(all).to.have.length(5);
      expect(new URL(browse.href).hash).to.equal('#/org/site');
      expect(browse.shadowRoot.querySelector('a[href]')).to.exist;
      expect(create.shadowRoot.querySelector('button').disabled).to.equal(false);
      docs.forEach((tile) => expect(tile.shadowRoot.querySelector('a[href]')).to.exist);
      expect(el.querySelector('da-sites')).to.equal(null);
      expect(block.querySelectorAll(':scope > div')).to.have.length(5);
      expect(fetchContent.called).to.equal(false);
    } finally {
      fetchContent.restore();
      main.remove();
    }
  });
});
