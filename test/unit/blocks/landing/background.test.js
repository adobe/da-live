import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-landing.js';
import { loadLanding as init, DaLanding } from '../../../../blocks/landing/landing.js';
import { DaRecentFiles } from '../../../../blocks/recent-files/recent-files.js';
import { getNx2 } from '../../../../scripts/utils.js';

const { getSiteOptions } = await import(`${getNx2()}/blocks/siteselector/site-utils.js`);
const tiles = await fetch('/test/fixtures/landing-tiles.html').then((response) => response.text());

describe('landing background with Content', () => {
  let el;
  let container;
  let initialize;

  beforeEach(() => {
    initialize = sinon.spy(DaLanding.prototype, 'initialize');
    sinon.stub(DaRecentFiles.prototype, 'loadSite').resolves();
    sinon.stub(window, 'fetch').resolves(new Response(tiles));
    getSiteOptions.returns([{ value: 'org/site', label: 'org/site' }]);
    localStorage.setItem('da-sites', JSON.stringify(['org/site']));
    el = document.createElement('div');
    el.className = 'browse';
    container = document.createElement('div');
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
    localStorage.removeItem('da-sites');
  });

  it('replaces authored content with Landing inside a landing surface', async () => {
    const content = await init(el);
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
    const content = await init(el);
    await initialize.lastCall.returnValue;
    await content.updateComplete;
    expect(el.firstElementChild).to.equal(surface);
    expect(surface.children.length).to.equal(1);
    expect(surface.firstElementChild).to.equal(content);
  });
});
