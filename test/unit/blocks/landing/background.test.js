import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import { loadLanding as init, DaLanding } from '../../../../blocks/landing/landing.js';
import { readLandingBlocks } from '../../../../blocks/browse/utils.js';
import { DaRecentFiles } from '../../../../blocks/landing/recent-files/recent-files.js';
import { getNx2 } from '../../../../scripts/utils.js';

const { getSiteOptions } = await import(`${getNx2()}/blocks/siteselector/site-utils.js`);
const markup = `
  <div class="greeting"><div><div><h1>Hi [firstname]</h1></div></div></div>
  <div class="recent-files"></div>`;
const { loadIms } = await import(`${getNx2()}/utils/ims.js`);

describe('landing background with Content', () => {
  let el;
  let container;
  let initialize;

  beforeEach(() => {
    loadIms.reset();
    loadIms.resolves({ accessToken: { token: 'test-token' } });
    initialize = sinon.spy(DaLanding.prototype, 'initialize');
    sinon.stub(DaRecentFiles.prototype, 'loadSite').resolves();
    getSiteOptions.returns([{ value: 'org/site', label: 'org/site' }]);
    localStorage.setItem('da-sites', JSON.stringify(['org/site']));
    el = document.createElement('div');
    el.className = 'browse';
    container = document.createElement('main');
    container.innerHTML = '<div class="section"><div class="block-content"></div></div>';
    container.querySelector('.block-content').append(el);
    el.innerHTML = '<picture><img alt="Old background"></picture>';
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
    sinon.restore();
    getSiteOptions.reset();
    getSiteOptions.returns([]);
    loadIms.reset();
    loadIms.resolves({ accessToken: { token: 'test-token' } });
    localStorage.removeItem('da-sites');
  });

  it('replaces authored content with Landing inside a landing surface', async () => {
    const blocks = readLandingBlocks(new DOMParser().parseFromString(markup, 'text/html'));
    const content = await init(el, { blocks });
    await initialize.lastCall.returnValue;
    await content.updateComplete;
    expect(el.children.length).to.equal(1);
    expect(el.firstElementChild.className).to.equal('landing');
    expect(el.firstElementChild.querySelector(':scope > da-landing')).to.equal(content);
    expect(content.querySelector('da-recent-files').shadowRoot.querySelector('#files-heading').textContent).to.equal('Content');
    expect(el.querySelector('img, picture')).to.equal(null);
  });

  it('reuses the prepainted landing surface when mounting Content', async () => {
    const surface = document.createElement('div');
    surface.className = 'landing';
    el.replaceChildren(surface);
    const blocks = readLandingBlocks(new DOMParser().parseFromString(markup, 'text/html'));
    const content = await init(el, { blocks });
    await initialize.lastCall.returnValue;
    await content.updateComplete;
    expect(el.firstElementChild).to.equal(surface);
    expect(surface.children.length).to.equal(1);
    expect(surface.firstElementChild).to.equal(content);
  });

  it('initializes authored greetings after authentication using the same profile as Content', async () => {
    container.insertAdjacentHTML('afterbegin', `<div class="greeting">
      <div><div><h1>Welcome, [firstname]</h1></div></div>
      <div><div>chat</div><div><h1>Chat with [firstname]</h1></div></div>
    </div>`);
    const authored = container.querySelector('div.greeting');
    const blocks = readLandingBlocks(new DOMParser().parseFromString(markup, 'text/html'));
    blocks[0] = authored.cloneNode(true);
    let finish;
    loadIms.returns(new Promise((resolve) => { finish = resolve; }));
    const mounted = init(el, { blocks });
    expect(container.querySelector('da-greeting')).to.equal(null);
    finish({ accessToken: { token: 'test-token' }, first_name: 'Ada' });
    const content = await mounted;
    await initialize.lastCall.returnValue;
    const greeting = content.querySelector('da-greeting');
    await greeting.updateComplete;
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(greeting.querySelector('h1').textContent).to.equal('Welcome, Ada');
    expect(greeting.querySelectorAll('h1')).to.have.length(1);
    expect(authored.textContent).to.include('[firstname]');
    expect(loadIms.calledOnce).to.equal(true);
    await content.updateComplete;
    expect(content.querySelector('da-recent-files').shadowRoot.querySelector('#files-heading').textContent).to.equal('Content');
  });

  it('does not start greeting authentication when history redirects to Start', async () => {
    container.insertAdjacentHTML('afterbegin', '<div class="greeting"><div><div><h1>Welcome, [firstname]</h1></div></div></div>');
    getSiteOptions.returns([]);
    const redirect = sinon.stub(DaLanding.prototype, 'redirectToStart');
    init(el);
    await initialize.lastCall.returnValue;
    expect(redirect.calledOnce).to.equal(true);
    expect(loadIms.called).to.equal(false);
    expect(container.querySelector('da-greeting')).to.equal(null);
  });
});
