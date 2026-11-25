import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: init } = await import('../../../../blocks/start/start.js');

describe('start page', () => {
  let main;

  beforeEach(() => {
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
  });

  it('sets the page title', () => {
    const { title } = document;
    init(main.querySelector('.start'));
    expect(document.title).to.equal('Start | Experience Workspace');
    document.title = title;
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
});
