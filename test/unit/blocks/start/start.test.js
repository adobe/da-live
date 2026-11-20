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
  });

  afterEach(() => {
    main.remove();
  });

  it('does not restore legacy controls when replacement content is absent', async () => {
    main.lastElementChild.remove();
    const el = main.querySelector('.start');
    init(el);

    const start = el.querySelector(':scope > da-start');
    expect(start).to.exist;
    await start.updateComplete;
    expect(start.shadowRoot.querySelector('form, .template-container')).to.be.null;
    expect(start.shadowRoot.querySelector('.cards-panel')).to.be.null;
  });

  it('moves the authored greeting into the start block', async () => {
    const el = main.querySelector('.start');
    const greetingEl = main.querySelector('div.greeting');
    init(el);
    const start = el.querySelector('da-start');
    await greetingEl.initialized;

    const greeting = start.querySelector('da-greeting');
    expect(greeting.slot).to.equal('greeting');
    expect(start.shadowRoot.querySelector('slot[name="greeting"]')).to.exist;
  });

  function addContent({ intro = true } = {}) {
    const section = main.lastElementChild;
    section.insertAdjacentHTML('beforeend', `
      <div class="block-content"><div class="add-site"></div></div>
      ${intro ? `<div class="default-content">
        <h2>Need to create a site?</h2>
        <p>Choose a starting point to create your AEM site.</p>
      </div>` : ''}
      <div class="block-content">
        <div class="nx-cards start"><nx-action-card></nx-action-card></div>
      </div>
      <p class="unrelated">Keep this content.</p>
    `);
    return section;
  }

  it('composes the authored blocks and panel text without dropping other content', async () => {
    const section = addContent();
    const cards = section.querySelector('.nx-cards');
    const addSite = section.querySelector('.add-site');
    const greetingEl = section.querySelector('div.greeting');
    init(main.querySelector('.start'));
    const start = main.querySelector('da-start');
    await start.updateComplete;
    await greetingEl.initialized;

    expect(start.shadowRoot.querySelector('form')).to.be.null;
    expect(start.shadowRoot.querySelector('slot[name="cards"]').assignedElements()[0]).to.equal(cards);
    expect(start.querySelector('[slot="add-site"]')).to.equal(addSite);
    expect(start.shadowRoot.querySelector('.cards-intro h2').textContent).to.equal('Need to create a site?');
    expect(start.shadowRoot.querySelector('.cards-intro p').textContent)
      .to.equal('Choose a starting point to create your AEM site.');
    expect(start.querySelector('da-greeting')).to.exist;
    expect(main.querySelector('.unrelated').isConnected).to.be.true;
  });

  it('supports blocks in the Start section without an optional panel intro', async () => {
    const section = addContent({ intro: false });
    section.prepend(main.querySelector('.start'));
    init(main.querySelector('.start'));
    const start = section.querySelector('da-start');
    await start.updateComplete;

    expect(start.shadowRoot.querySelector('.cards-panel')).to.exist;
    expect(start.shadowRoot.querySelector('.cards-intro')).to.be.null;
    expect(start.querySelector('nx-action-card')).to.exist;
  });

  it('does not render an empty cards panel when cards are not authored', async () => {
    addContent();
    main.querySelector('.nx-cards').remove();
    init(main.querySelector('.start'));
    const start = main.querySelector('da-start');
    await start.updateComplete;

    expect(start.querySelector('[slot="add-site"]')).to.exist;
    expect(start.shadowRoot.querySelector('form')).to.be.null;
    expect(start.shadowRoot.querySelector('.cards-panel')).to.be.null;
  });

  it('composes authored cards even when Add Site is not authored yet', async () => {
    addContent();
    main.querySelector('.add-site').remove();
    init(main.querySelector('.start'));
    const start = main.querySelector('da-start');
    await start.updateComplete;

    expect(start.shadowRoot.querySelector('slot[name="cards"]').assignedElements()[0])
      .to.equal(start.querySelector('.nx-cards'));
    expect(start.shadowRoot.querySelector('form, .template-container')).to.be.null;
  });

  it('reuses a greeting that the page loader already initialized', async () => {
    addContent();
    const { default: initGreeting } = await import('../../../../blocks/greeting/greeting.js');
    const greeting = await initGreeting(main.querySelector('div.greeting'));
    init(main.querySelector('.start'));
    const start = main.querySelector('da-start');
    await start.updateComplete;

    expect(start.querySelector('da-greeting')).to.equal(greeting);
    expect(greeting.slot).to.equal('greeting');
  });

  it('does not restore the retired creation flow for org/site links', async () => {
    addContent();
    const { href } = window.location;
    try {
      const url = new URL(href);
      url.searchParams.set('org', 'example');
      url.searchParams.set('site', 'starter');
      window.history.replaceState({}, '', url);
      init(main.querySelector('.start'));
      const start = main.querySelector('da-start');
      await start.updateComplete;

      expect(start.shadowRoot.querySelector('form, .template-container')).to.be.null;
      expect(start.shadowRoot.querySelector('slot[name="add-site"]')).to.exist;
    } finally {
      window.history.replaceState({}, '', href);
    }
  });
});
