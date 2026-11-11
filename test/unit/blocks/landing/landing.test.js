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
const [styles, recentStyles, tileStyles] = await Promise.all([
  '/blocks/landing/landing.css',
  '/blocks/recent-files/recent-files.css',
  '/blocks/landing/tile-group.css',
].map(async (path) => {
  const css = await fetch(path).then((response) => response.text());
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  return sheet;
}));

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

  [1400, 360].forEach((width) => {
    it(`centers and aligns Landing at ${width}px in both file views without clipping overflow`, async () => {
      el.style.cssText = `width: ${width}px;
        --s2-spacing-200: 12px;
        --s2-spacing-300: 16px;
        --s2-spacing-400: 24px;
        --s2-spacing-600: 40px;`;
      const landing = await mount();
      await landing.updateComplete;
      const files = landing.querySelector('da-recent-files');
      const tiles = landing.querySelector('da-landing-tiles');
      landing.shadowRoot.adoptedStyleSheets = [styles];
      files.shadowRoot.adoptedStyleSheets = [recentStyles];
      tiles.shadowRoot.adoptedStyleSheets = [tileStyles];
      files._files = [{ name: 'Page', path: '/org/site/page.html', ext: 'html' }];
      files._view = 'card';
      await Promise.all([files.updateComplete, tiles.updateComplete]);

      const layout = landing.querySelector('.landing-content');
      const column = layout.getBoundingClientRect();
      const host = landing.getBoundingClientRect();
      const panel = files.shadowRoot.querySelector('.files-panel');
      const tileGroup = tiles.shadowRoot.querySelector('.tile-group');
      const greeting = landing.querySelector('da-greeting');
      expect(column.width).to.be.at.most(1068);
      expect(column.width).to.be.closeTo(width < 600 ? width - 32 : 1068, 0.5);
      expect(column.left - host.left).to.be.closeTo(host.right - column.right, 0.5);
      expect(getComputedStyle(greeting).textAlign).to.equal('center');
      expect(panel.getBoundingClientRect().left).to.be.closeTo(column.left, 0.5);
      expect(panel.getBoundingClientRect().width).to.be.closeTo(column.width, 0.5);
      expect(tileGroup.getBoundingClientRect().left).to.be.closeTo(column.left, 0.5);
      expect(tileGroup.getBoundingClientRect().width).to.be.closeTo(column.width, 0.5);
      const sections = [...layout.children].map((block) => block.getBoundingClientRect());
      const gap = width < 600 ? 24 : 40;
      expect(sections[1].top - sections[0].bottom).to.be.closeTo(gap, 0.5);
      expect(sections[2].top - sections[1].bottom).to.be.closeTo(gap, 0.5);

      files._view = 'list';
      await files.updateComplete;
      expect(panel.dataset.view).to.equal('list');
      expect(panel.getBoundingClientRect().width).to.be.closeTo(column.width, 0.5);
      expect(panel.getBoundingClientRect().left).to.be.closeTo(column.left, 0.5);

      const contentHeight = landing.getBoundingClientRect().height;
      el.style.height = `${contentHeight + 400}px`;
      const surface = el.firstElementChild;
      let surfaceBounds = surface.getBoundingClientRect();
      let landingBounds = landing.getBoundingClientRect();
      expect(surfaceBounds.height).to.be.closeTo(contentHeight + 400, 0.5);
      expect(landingBounds.top - surfaceBounds.top).to.be.closeTo(200, 0.5);
      expect(surfaceBounds.bottom - landingBounds.bottom).to.be.closeTo(200, 0.5);

      el.style.height = '100px';
      surfaceBounds = surface.getBoundingClientRect();
      landingBounds = landing.getBoundingClientRect();
      expect(landingBounds.top).to.be.closeTo(surfaceBounds.top, 0.5);
      expect(surfaceBounds.height).to.be.at.least(contentHeight);
      expect(landingBounds.height).to.be.closeTo(contentHeight, 0.5);
    });
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

  it('reports missing authored content without fetching another page', async () => {
    const fetchContent = sinon.spy(window, 'fetch');
    const landing = await loadLanding(el);
    await landing.updateComplete;
    expect(landing.shadowRoot.querySelector('[role="alert"]').textContent).to.equal('No Landing content is configured.');
    expect(landing.children).to.have.length(0);
    expect(fetchContent.called).to.equal(false);
    expect(loadSite.called).to.equal(false);
  });

  it('resolves authored tile links relative to the current page', async () => {
    const authored = blocks();
    authored[2].querySelector('a').setAttribute('href', './guide');
    const landing = await mount(authored);
    const tiles = landing.querySelector('da-landing-tiles');
    await tiles.updateComplete;
    const browse = tiles.shadowRoot.querySelector('da-landing-tile');
    await browse.updateComplete;
    expect(new URL(browse.href).pathname).to.equal(new URL('./guide', window.location.href).pathname);
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
