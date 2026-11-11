import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import init from '../../../../blocks/browse/browse.js';
import { DaLanding } from '../../../../blocks/landing/landing.js';
import { getNx, getNx2, getNx2Api } from '../../../../scripts/utils.js';

const { hashChange, loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { source, config } = await getNx2Api();
const { getSiteOptions } = await import(`${getNx2()}/blocks/siteselector/site-utils.js`);

describe('Browse Content opt-in', () => {
  // Each init subscribes to hash changes; drop them so later hash updates don't reach old views.
  let subscribe;
  let initialize;
  let loadSite;
  beforeEach(() => {
    subscribe = sinon.spy(hashChange, 'subscribe');
    initialize = sinon.spy(DaLanding.prototype, 'initialize');
    loadSite = sinon.stub(DaLanding.prototype, 'loadSite').resolves();
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
    const ordinary = document.createElement('div');
    const browse = document.createElement('da-browse');
    const details = { org: 'org', site: 'site', fullpath: '/org/site' };
    browse.details = details;
    ordinary.append(browse);
    document.body.append(ordinary);
    const list = sinon.stub(source, 'list').callsFake(async (fullpath) => ({
      ok: true,
      items: [{ name: 'page', path: `${fullpath}/page.html`, ext: 'html' }],
    }));
    const configs = sinon.stub(config, 'get').resolves({ ok: true, json: async () => ({ data: [] }) });
    const fetch = sinon.stub(window, 'fetch').resolves(new Response('{}'));
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
      expect(window.location.href).to.equal(rootHref);
      expect(landing.shadowRoot.querySelector('.files-panel')).not.to.equal(null);
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
      ordinary.remove();
      list.restore();
      configs.restore();
      fetch.restore();
      window.history.replaceState(null, '', href);
      localStorage.removeItem('da-sites');
    }
  });

  it('waits for the landing gradient surface before the section is shown', async () => {
    const { href } = window.location;
    const el = document.createElement('div');
    el.innerHTML = '<div><picture><img alt=""></picture></div>';
    document.body.append(el);
    try {
      const url = new URL(href);
      url.searchParams.set('landing', 'true');
      url.hash = '';
      window.history.replaceState(null, '', url);
      hashChange._set(undefined);
      const ready = init(el);
      expect(ready).to.be.instanceOf(Promise);
      await ready;
      expect(el.querySelector('picture')).to.equal(null);
      expect(el.firstElementChild.className).to.equal('landing');
    } finally {
      el.remove();
      window.history.replaceState(null, '', href);
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
    Object.defineProperty(browse, 'details', {
      configurable: true,
      set(details) {
        received = details;
        adoptedAtUpdate = document.adoptedStyleSheets.includes(browseSheet);
      },
    });
    el.append(browse);
    document.body.append(el);
    let ready;
    try {
      const url = new URL(href);
      url.searchParams.delete('landing');
      url.hash = '/org';
      window.history.replaceState(null, '', url);
      hashChange._set({ org: 'org' });
      ready = init(el);
      await new Promise((resolve) => { setTimeout(resolve); });
      expect(received).to.equal(undefined);
      expect(document.adoptedStyleSheets.includes(browseSheet)).to.equal(false);
      adoptBrowseSheet(browseSheet);
      await ready;
      expect(received).to.deep.equal({ org: 'org' });
      expect(adoptedAtUpdate).to.equal(true);
    } finally {
      // Settle the held stylesheet so init never stays parked if an assertion failed early.
      adoptBrowseSheet(browseSheet);
      await ready;
      loadStyle._set(browseHref);
      document.adoptedStyleSheets = document.adoptedStyleSheets
        .filter((sheet) => sheet !== browseSheet);
      el.remove();
      window.history.replaceState(null, '', href);
    }
  });
});
