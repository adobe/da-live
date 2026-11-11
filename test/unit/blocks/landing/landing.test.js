import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-landing.js';
import initTiles, { DaLanding, loadLanding } from '../../../../blocks/landing/landing.js';
import { readLandingBlocks } from '../../../../blocks/landing/landing-content.js';
import { DaRecentFiles } from '../../../../blocks/recent-files/recent-files.js';
import { getNx2 } from '../../../../scripts/utils.js';

const { getSiteOptions } = await import(`${getNx2()}/blocks/siteselector/site-utils.js`);
const { loadIms, handleSignIn } = await import(`${getNx2()}/utils/ims.js`);
const content = await fetch('/test/fixtures/landing-tiles.html').then((response) => response.text());
const css = await fetch('/blocks/landing/landing.css').then((response) => response.text());
const styles = new CSSStyleSheet();
styles.replaceSync(css);

describe('authored Landing composition', () => {
  let el;
  let loadSite;
  let originalStyles;

  const blocks = () => readLandingBlocks(new DOMParser().parseFromString(content, 'text/html'));
  const mount = (authored = blocks()) => loadLanding(el, { blocks: authored });

  beforeEach(() => {
    loadIms.reset();
    loadIms.resolves({ accessToken: { token: 'test-token' }, first_name: 'Ada' });
    handleSignIn.resetHistory();
    getSiteOptions.reset();
    getSiteOptions.returns([{ value: 'org/site' }]);
    localStorage.setItem('da-sites', JSON.stringify(['org/site']));
    loadSite = sinon.stub(DaRecentFiles.prototype, 'loadSite').resolves();
    originalStyles = document.adoptedStyleSheets;
    document.adoptedStyleSheets = [...originalStyles, styles];
    el = document.createElement('div');
    el.className = 'browse';
    el.innerHTML = '<picture><img alt="Old background"></picture>';
    document.body.append(el);
  });

  afterEach(() => {
    el.remove();
    sinon.restore();
    document.adoptedStyleSheets = originalStyles;
    getSiteOptions.reset();
    getSiteOptions.returns([]);
    loadIms.reset();
    loadIms.resolves({ accessToken: { token: 'test-token' } });
    handleSignIn.resetHistory();
    localStorage.removeItem('da-sites');
  });

  it('hydrates greeting, shared Recent Files and tiles in authored order', async () => {
    const fetchContent = sinon.spy(window, 'fetch');
    const authored = blocks();
    const landing = await mount(authored);
    await landing.updateComplete;
    expect([...landing.firstElementChild.children].map((block) => block.className))
      .to.deep.equal(['greeting', 'recent-files', 'landing']);
    expect(landing.querySelector('h1').textContent).to.equal('Hi Ada, how can I help?');
    expect(landing.querySelector('da-recent-files').path).to.equal('/org/site');
    const tiles = landing.querySelector('da-landing-tiles');
    await tiles.updateComplete;
    expect(tiles.entries).to.have.length(5);
    expect(landing.querySelector('.browse, script')).to.equal(null);
    expect(el.querySelector('picture, img')).to.equal(null);
    expect(authored[0].querySelector('h1').textContent).to.include('[firstname]');
    expect(fetchContent.called).to.equal(false);
  });

  it('uses content order rather than prepending tiles or hardcoding sections', async () => {
    const landing = await mount(blocks().reverse());
    expect([...landing.firstElementChild.children].map((block) => block.className))
      .to.deep.equal(['landing', 'recent-files', 'greeting']);
  });

  it('keeps the first selected site shared and updates both blocks without changing the route', async () => {
    const { href } = window.location;
    const recentSites = ['invalid', 'selected/site', 'history/site'];
    localStorage.setItem('da-sites', JSON.stringify(recentSites));
    getSiteOptions.returns([{ value: 'selected/site' }, { value: 'history/site' }]);
    const landing = await mount();
    const files = landing.querySelector('da-recent-files');
    const tiles = landing.querySelector('da-landing-tiles');
    await tiles.updateComplete;
    let browse = tiles.shadowRoot.querySelector('da-landing-tile');
    await browse.updateComplete;
    expect(files.path).to.equal('/selected/site');
    expect(new URL(browse.href).hash).to.equal('#/selected/site');
    expect(getSiteOptions.calledWithExactly({ recentSites })).to.equal(true);
    document.dispatchEvent(new CustomEvent('site-select', { detail: { value: 'another/site' } }));
    await tiles.updateComplete;
    browse = tiles.shadowRoot.querySelector('da-landing-tile');
    await browse.updateComplete;
    expect(files.path).to.equal('/another/site');
    expect(new URL(browse.href).hash).to.equal('#/another/site');
    expect(window.location.href).to.equal(href);
    expect(loadSite.callCount).to.equal(2);
    el.remove();
    document.dispatchEvent(new CustomEvent('site-select', { detail: { value: 'ignored/site' } }));
    expect(files.path).to.equal('/another/site');
  });

  it('treats the profile substitution as text, not markup or chat-owned greeting copy', async () => {
    loadIms.resolves({ accessToken: {}, first_name: '<img src=x>' });
    const authored = blocks();
    authored[0].querySelector('h1').textContent = 'Welcome back, [firstname]!';
    const landing = await mount(authored);
    expect(landing.querySelector('h1').textContent).to.equal('Welcome back, <img src=x>!');
    expect(landing.querySelector('img')).to.equal(null);
  });

  it('redirects missing, invalid and unreadable history before authentication or block mounting', async () => {
    const redirect = sinon.stub(DaLanding.prototype, 'redirectToStart');
    getSiteOptions.returns([]);
    for (const history of [null, '["invalid"]', '{']) {
      if (history === null) localStorage.removeItem('da-sites');
      else localStorage.setItem('da-sites', history);
      // eslint-disable-next-line no-await-in-loop
      const landing = await mount();
      expect(landing.children).to.have.length(0);
    }
    expect(redirect.callCount).to.equal(3);
    expect(loadIms.called).to.equal(false);
    expect(loadSite.called).to.equal(false);
  });

  [false, true].forEach((signedIn) => {
    it(`waits for authentication before ${signedIn ? 'mounting content' : 'starting sign-in once'}`, async () => {
      let finish;
      loadIms.returns(new Promise((resolve) => { finish = resolve; }));
      const mounted = mount();
      expect(el.querySelector('da-landing').children).to.have.length(0);
      expect(loadSite.called).to.equal(false);
      finish(signedIn ? { accessToken: {}, first_name: 'Ada' } : { anonymous: true });
      const landing = await mounted;
      expect(handleSignIn.callCount).to.equal(signedIn ? 0 : 1);
      expect(!!landing.querySelector('da-recent-files')).to.equal(signedIn);
    });
  });

  it('reloads after cached IMS failure instead of retrying the rejected promise', async () => {
    loadIms.returns(Promise.reject(new Error('IMS unavailable')));
    const reload = sinon.stub(DaLanding.prototype, 'reloadPage');
    const landing = await mount();
    await landing.updateComplete;
    expect(landing.shadowRoot.querySelector('[role="alert"]').textContent).to.include('Could not sign in');
    landing.shadowRoot.querySelector('button').click();
    expect(reload.calledOnce).to.equal(true);
    expect(loadIms.calledOnce).to.equal(true);
    expect(loadSite.called).to.equal(false);
  });

  it('does not sign in or mount blocks after leaving during authentication', async () => {
    let finish;
    loadIms.returns(new Promise((resolve) => { finish = resolve; }));
    const mounted = mount();
    el.replaceChildren();
    finish({ anonymous: true });
    await mounted;
    expect(handleSignIn.called).to.equal(false);
    expect(loadSite.called).to.equal(false);
    expect(el.children).to.have.length(0);
  });

  it('retries failed content loading and resolves tile links relative to the authored source', async () => {
    const doc = new DOMParser().parseFromString(content, 'text/html');
    doc.querySelector('.landing a').setAttribute('href', './guide');
    const fetchContent = sinon.stub(window, 'fetch');
    fetchContent.onFirstCall().resolves(new Response('', { status: 503 }));
    fetchContent.onSecondCall().resolves(new Response(doc.body.innerHTML));
    const landing = await loadLanding(el);
    await landing.updateComplete;
    expect(landing.shadowRoot.querySelector('[role="alert"]').textContent).to.include('Could not load');
    await landing.loadContent();
    const tiles = landing.querySelector('da-landing-tiles');
    await tiles.updateComplete;
    const browse = tiles.shadowRoot.querySelector('da-landing-tile');
    await browse.updateComplete;
    expect(new URL(browse.href).pathname).to.equal('/drafts/mhaack/guide');
    expect(fetchContent.callCount).to.equal(2);
  });

  it('leaves outer authored tile data intact for the route host', () => {
    const block = blocks()[2];
    const original = block.innerHTML;
    el.append(block);
    initTiles(block);
    expect(block.hidden).to.equal(true);
    expect(block.innerHTML).to.equal(original);
  });
});
