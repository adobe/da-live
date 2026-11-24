import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
const nx = setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { loadStyle } = await import(`${nx}/utils/utils.js`);
const sheet = new CSSStyleSheet();
sheet.replaceSync(await (await fetch('/blocks/start/start.css')).text());
loadStyle._set(new URL('../../../../blocks/start/start.js', import.meta.url).href, sheet);

const { default: init } = await import('../../../../blocks/start/start.js');

describe('authored Start page', () => {
  let originalSheets;
  let container;
  let surface;
  let entry;

  beforeEach(() => {
    originalSheets = [...document.adoptedStyleSheets];
    container = document.createElement('div');
    container.innerHTML = `<div class="block-content">
      <div class="start"><div><div></div></div></div>
      <da-greeting class="greeting">Welcome</da-greeting>
      <div class="add-site">Add a site</div>
      <div class="content">Additional authored content</div>
      <div class="nx-cards start">
        <div>One</div><div>Two</div><div>Three</div><div>Four</div>
      </div>
    </div>`;
    document.body.append(container);
    surface = container.firstElementChild;
    entry = surface.querySelector('div.start');
  });

  afterEach(() => {
    container.remove();
    document.adoptedStyleSheets = originalSheets;
  });

  it('initializes the page surface without replacing its authored blocks', () => {
    const blocks = [...surface.children];
    init(entry);

    expect(surface.classList.contains('start-page')).to.be.true;
    expect(entry.hidden).to.be.true;
    expect(surface.querySelector('da-start')).to.be.null;
    expect([...document.adoptedStyleSheets]).to.include(sheet);
    expect(surface.children.length).to.equal(blocks.length);
    blocks.forEach((block, index) => {
      expect(surface.children[index]).to.equal(block);
    });
  });

  it('initializes independently of the child blocks', () => {
    surface.replaceChildren(entry);
    init(entry);

    expect(surface.classList.contains('start-page')).to.be.true;
    expect(entry.hidden).to.be.true;
  });

  it('supports section-level content without a block-content wrapper', () => {
    surface.className = 'section';
    init(entry);

    expect(surface.classList.contains('start-page')).to.be.true;
  });

  it('scopes the layout to the section when authored blocks have separate wrappers', () => {
    surface.className = 'section';
    surface.innerHTML = `<div class="block-content">
      <div class="start"><div><div></div></div></div>
      <da-greeting class="greeting">Welcome</da-greeting>
      <div class="add-site">Add a site</div>
    </div>
    <div class="default-content"><h4>Need to create a site?</h4></div>
    <div class="block-content"><div class="nx-cards start">Cards</div></div>`;
    entry = surface.querySelector('div.start');
    const intro = surface.querySelector('.default-content');
    const cards = surface.querySelector('.nx-cards.start');
    init(entry);

    expect(surface.classList.contains('start-page')).to.be.true;
    expect(entry.parentElement.classList.contains('start-page')).to.be.false;
    expect(entry.hidden).to.be.true;
    const panel = surface.querySelector('.start-cards-panel');
    expect([...panel.children]).to.deep.equal([intro, cards]);
    expect(panel.textContent).to.contain('Need to create a site?');
    init(entry);
    expect(surface.querySelectorAll('.start-cards-panel').length).to.equal(1);
  });

  it('keeps cards alone when no introduction is authored', () => {
    surface.className = 'section';
    surface.innerHTML = `<div class="block-content">
      <div class="start"></div><div class="add-site"></div>
    </div><div class="block-content"><div class="nx-cards start">Cards</div></div>`;
    entry = surface.querySelector('div.start');
    const cards = surface.querySelector('.nx-cards.start');
    init(entry);

    expect(surface.querySelector('.start-cards-panel')).to.be.null;
    expect(cards.parentElement.className).to.equal('block-content');
  });

  it('does not move unrelated authored content into the cards panel', () => {
    surface.className = 'section';
    surface.innerHTML = `<div class="block-content"><div class="start"></div></div>
      <div class="default-content"><h4>Other content</h4><ul><li>Keep here</li></ul></div>
      <div class="block-content"><div class="nx-cards start">Cards</div></div>`;
    entry = surface.querySelector('div.start');
    const intro = surface.querySelector('.default-content');
    init(entry);

    expect(surface.querySelector('.start-cards-panel')).to.be.null;
    expect(intro.parentElement).to.equal(surface);
  });

  it('fits a panel with authored text on wide and narrow screens with space around Add Site', () => {
    container.style.cssText = `
      width: 900px;
      --s2-spacing-300: 16px;
      --s2-spacing-400: 24px;
      --s2-spacing-600: 40px;
    `;
    surface.className = 'section';
    surface.innerHTML = `<div class="block-content">
      <div class="start"></div>
      <da-greeting class="greeting"><h1>Welcome</h1><p>Add a site</p></da-greeting>
      <div class="add-site" style="height: 80px"></div>
    </div>
    <div class="default-content"><h4>Need to create a site?</h4><p>Choose a starting point.</p></div>
    <div class="block-content"><div class="nx-cards start" style="display: grid; gap: 16px">
      <div>One</div><div>Two</div><div>Three</div><div>Four</div>
    </div></div>`;
    entry = surface.querySelector('div.start');
    init(entry);

    const panel = surface.querySelector('.start-cards-panel');
    const cards = panel.querySelector('.nx-cards.start');
    const intro = panel.querySelector('.default-content');
    const addSite = surface.querySelector('.add-site');
    const greeting = surface.querySelector('.greeting');
    expect(addSite.getBoundingClientRect().top - greeting.getBoundingClientRect().bottom)
      .to.equal(40);
    expect(panel.getBoundingClientRect().top - addSite.getBoundingClientRect().bottom)
      .to.equal(16);
    expect(panel.getBoundingClientRect().width).to.equal(664);
    expect(getComputedStyle(cards).gridTemplateColumns.split(' ').length).to.equal(2);
    expect(cards.getBoundingClientRect().top - intro.getBoundingClientRect().bottom).to.equal(16);
    expect(intro.getBoundingClientRect().left - panel.getBoundingClientRect().left).to.equal(16);
    expect(getComputedStyle(cards).padding).to.equal('0px');

    container.style.width = '320px';
    expect(container.scrollWidth).to.equal(320);
    expect(getComputedStyle(cards).gridTemplateColumns.split(' ').length).to.equal(1);
    expect(cards.children[1].offsetTop).to.be.greaterThan(cards.children[0].offsetTop);
    const panelRect = panel.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    expect(panelRect.left - surfaceRect.left).to.equal(24);
    expect(surfaceRect.right - panelRect.right).to.equal(24);
    expect(surfaceRect.bottom - panelRect.bottom).to.be.at.least(24);
  });

  it('adopts the Start stylesheet only once', () => {
    init(entry);
    const sheets = [...document.adoptedStyleSheets];
    init(entry);

    expect(document.adoptedStyleSheets).to.deep.equal(sheets);
  });
});
