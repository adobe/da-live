import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: init } = await import('../../../../blocks/start/start.js');

describe('start page', () => {
  let main;
  let sheets;

  beforeEach(() => {
    sheets = [...document.adoptedStyleSheets];
    main = document.createElement('main');
    main.innerHTML = `
      <div class="section"><div class="start"></div></div>
      <div class="section"><div class="greeting"><div><div><h1>Welcome to Experience Workspace</h1></div></div></div></div>`;
    document.body.append(main);
    ['red-100', 'pink-200', 'blue-200', 'gray-25'].forEach((token) => {
      main.style.setProperty(`--s2-${token}`, 'white');
    });
  });

  afterEach(() => {
    main.remove();
    document.adoptedStyleSheets = sheets;
  });

  it('uses the dark gradient', () => {
    const el = main.querySelector('.start');
    init(el);

    const start = el.querySelector(':scope > da-start');
    expect(start).to.exist;
    expect(getComputedStyle(start).colorScheme).to.equal('dark');
    expect(getComputedStyle(start).backgroundImage).to.contain('radial-gradient');
  });

  it('moves the authored greeting into the start block', async () => {
    const el = main.querySelector('.start');
    const greetingEl = main.querySelector('div.greeting');
    init(el);
    const start = el.querySelector('da-start');
    await greetingEl.initialized;

    const greeting = start.querySelector('da-greeting');
    expect(greeting.slot).to.equal('greeting');
    expect(main.querySelectorAll('.section').length).to.equal(1);
    expect(start.shadowRoot.querySelector('slot[name="greeting"]')).to.exist;
  });

  it('applies the cards layout once from Start and preserves desktop and narrow sizing', () => {
    const container = document.createElement('div');
    container.style.cssText = `
      display: grid;
      width: 900px;
      --s2-spacing-300: 16px;
    `;
    container.innerHTML = `<div class="nx-cards start" style="display: grid; gap: var(--s2-spacing-300)">
      <nx-action-card>One</nx-action-card><nx-action-card>Two</nx-action-card>
      <nx-action-card>Three</nx-action-card><nx-action-card>Four</nx-action-card>
    </div>`;
    main.append(container);
    const grid = container.firstElementChild;
    expect(getComputedStyle(grid).maxWidth).to.equal('none');

    init(main.querySelector('.start'));
    init(document.createElement('div'));
    expect(document.adoptedStyleSheets.length).to.equal(sheets.length + 1);
    const style = getComputedStyle(grid);
    expect(grid.getBoundingClientRect().width).to.equal(664);
    expect(grid.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight))
      .to.equal(632);
    expect(style.gridTemplateColumns.split(' ').length).to.equal(2);

    container.style.width = '260px';
    expect(container.scrollWidth).to.equal(260);
    expect(grid.getBoundingClientRect().width).to.equal(260);
    expect(getComputedStyle(grid).gridTemplateColumns.split(' ').length).to.equal(1);
    expect(grid.children[1].offsetTop).to.be.greaterThan(grid.children[0].offsetTop);
  });

  it('does not apply the Start panel layout to Tools cards', () => {
    const cards = document.createElement('div');
    cards.className = 'nx-cards tools';
    main.append(cards);
    init(main.querySelector('.start'));
    expect(getComputedStyle(cards).maxWidth).to.equal('none');
    expect(getComputedStyle(cards).padding).to.equal('0px');
  });
});
