import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: init } = await import('../../../../blocks/start/start.js');

describe('start page', () => {
  let main;
  let sheets;

  before(() => { sheets = document.adoptedStyleSheets; });

  after(() => { document.adoptedStyleSheets = sheets; });

  beforeEach(() => {
    document.body.classList.add('light-scheme');
    main = document.createElement('main');
    main.innerHTML = `
      <div class="section"><div class="start cmp"></div></div>
      <div class="section"><div class="greeting"><div><div><h1>Welcome to Experience Workspace</h1></div></div></div></div>`;
    document.body.append(main);
    ['red-100', 'pink-200', 'blue-200', 'gray-25'].forEach((token) => {
      main.style.setProperty(`--s2-${token}`, 'white');
    });
  });

  afterEach(() => {
    main.remove();
    document.body.classList.remove('light-scheme');
  });

  it('uses the dark gradient', () => {
    const el = main.querySelector('.start');
    init(el);

    expect(el.querySelector(':scope > da-start')).to.exist;
    expect(getComputedStyle(el).colorScheme).to.equal('dark');
    expect(getComputedStyle(el).backgroundImage).to.contain('radial-gradient');
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
});
