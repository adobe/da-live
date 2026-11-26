import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: init } = await import('../../../../blocks/start/start.js');

describe('start page', () => {
  let main;

  beforeEach(() => {
    main = document.createElement('main');
    main.innerHTML = `
      <div class="section"><div class="start cmp"></div></div>
      <div class="section"><div class="greeting"><div><div><h1>Welcome to Experience Workspace</h1></div></div></div></div>`;
    document.body.append(main);
  });

  afterEach(() => {
    main.remove();
  });

  it('mounts the legacy wizard instead of initializing the authored page', () => {
    const el = main.querySelector('.start');
    init(el);

    const start = el.querySelector(':scope > da-start');
    expect(start).to.exist;
    expect(el.hidden).to.be.false;
    expect(main.querySelector('.start-page')).to.be.null;
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
