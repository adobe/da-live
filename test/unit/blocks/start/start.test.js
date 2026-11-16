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

  it('uses the dark landing gradient without the old background or step count', async () => {
    const el = main.querySelector('.start');
    await init(el);
    const start = el.querySelector('da-start');
    await start.updateComplete;

    expect(el.classList.contains('landing')).to.be.true;
    expect(el.style.colorScheme).to.equal('dark');
    expect(getComputedStyle(el).backgroundImage).to.contain('radial-gradient');
    expect(start.shadowRoot.querySelector('.background, .gradient, .step-count')).to.be.null;
  });

  it('moves the authored greeting into the start block', async () => {
    const el = main.querySelector('.start');
    await init(el);
    const start = el.querySelector('da-start');
    await new Promise((resolve) => { setTimeout(resolve, 50); });

    const greeting = start.querySelector('da-greeting');
    expect(greeting.slot).to.equal('greeting');
    expect(main.querySelectorAll('.section').length).to.equal(1);
    expect(start.shadowRoot.querySelector('slot[name="greeting"]')).to.exist;
  });
});
