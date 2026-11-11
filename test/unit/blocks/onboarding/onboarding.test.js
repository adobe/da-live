import { expect } from '@esm-bundle/chai';

const { setNx, getNx2 } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { parseSubdomain } = await import(`${getNx2()}/blocks/siteselector/site-utils.js`);
const { default: init } = await import('../../../../blocks/onboarding/onboarding.js');

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

const CARDS_HTML = `
  <div class="nx-cards start">
    <div>
      <div><span class="icon icon-Calendar"></span><em>#F4EBFC</em></div>
      <div><h3><a href="https://da.live/apps/scheduler">AEM Scheduler</a></h3><p>Preview page changes.</p></div>
    </div>
    <div>
      <div><span class="icon icon-TreeView"></span></div>
      <div><h3><a href="/apps/traverse">Traverse</a></h3><p>Traverse a content tree.</p></div>
    </div>
  </div>`;

describe('da-onboarding', () => {
  let el;
  let savedIms;

  const mount = async () => {
    el = document.createElement('da-onboarding');
    document.body.append(el);
    await el.updateComplete;
    await nextFrame();
    await el.updateComplete;
  };

  const typeUrl = async (value) => {
    const input = el.shadowRoot.querySelector('input');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await el.updateComplete;
  };

  let savedFetch;

  beforeEach(() => {
    savedIms = window.adobeIMS;
    savedFetch = window.fetch;
    window.fetch = async (url, opts) => (url === '/drafts/mhaack/start-copy.plain.html'
      ? new Response(CARDS_HTML)
      : savedFetch(url, opts));
  });

  afterEach(() => {
    el.remove();
    window.adobeIMS = savedIms;
    window.fetch = savedFetch;
    parseSubdomain.reset();
  });

  it('replaces the block content with the onboarding page on the landing surface', () => {
    const sheetCount = document.adoptedStyleSheets.length;
    el = document.createElement('div');
    el.append(document.createElement('da-sites'));
    init(el);
    init(el);
    expect(el.children.length).to.equal(1);
    expect(el.firstElementChild.localName).to.equal('da-onboarding');
    expect(el.firstElementChild.classList.contains('landing')).to.be.true;
    expect(document.adoptedStyleSheets.length).to.equal(sheetCount + 1);
  });

  it('renders the cards authored in the onboarding content', async () => {
    await mount();
    for (let i = 0; i < 20 && !el._cards; i += 1) await nextFrame();
    await el.updateComplete;
    const cards = [...el.shadowRoot.querySelectorAll('.cards nx-action-card')]
      .map((card) => ['heading', 'description', 'icon', 'tint', 'action']
        .reduce((data, key) => ({ ...data, [key]: card[key] }), {}));
    expect(cards).to.deep.equal([
      {
        heading: 'AEM Scheduler',
        description: 'Preview page changes.',
        icon: '/img/icons/s2-icon-calendar-20-n.svg',
        tint: '#F4EBFC',
        action: 'https://da.live/apps/scheduler',
      },
      {
        heading: 'Traverse',
        description: 'Traverse a content tree.',
        icon: '/img/icons/s2-icon-treeview-20-n.svg',
        tint: undefined,
        action: '/apps/traverse',
      },
    ]);
  });

  it('enables Open once a URL is entered', async () => {
    await mount();
    const button = el.shadowRoot.querySelector('form button');
    expect(button.disabled).to.be.true;
    await typeUrl('  ');
    expect(button.disabled).to.be.true;
    await typeUrl('https://main--geometrixx--adobe.aem.page');
    expect(button.disabled).to.be.false;
  });

  it('rejects URLs that are not an AEM site', async () => {
    await mount();
    await typeUrl('https://github.com/adobe/geometrixx');
    el.shadowRoot.querySelector('form button').click();
    await el.updateComplete;
    const input = el.shadowRoot.querySelector('input');
    expect(el.shadowRoot.querySelector('#site-error').textContent)
      .to.equal('Enter an existing AEM site URL.');
    expect(input.getAttribute('aria-invalid')).to.equal('true');
    expect(input.getAttribute('aria-describedby')).to.equal('site-hint site-error');
  });

  it('shows the add site error and lets the user retry', async () => {
    window.adobeIMS = { isSignedInUser: () => false };
    parseSubdomain.returns('#/adobe/geometrixx');
    await mount();
    await typeUrl('https://main--geometrixx--adobe.aem.page');
    el.shadowRoot.querySelector('form button').click();
    await nextFrame();
    await el.updateComplete;
    const form = el.shadowRoot.querySelector('form');
    expect(form.classList.contains('nx-field-error')).to.be.true;
    expect(form.querySelector('[role="alert"]').textContent).to.equal('You need to sign in first.');
    expect(form.querySelector('button').disabled).to.be.false;

    await typeUrl('https://main--other--adobe.aem.page');
    expect(form.querySelector('[role="alert"]')).to.be.null;
  });

  it('prefills and submits the site requested in the URL', async () => {
    const { href } = window.location;
    window.history.replaceState(null, '', '?org=adobe&site=geometrixx');
    window.adobeIMS = { isSignedInUser: () => false };
    parseSubdomain.withArgs('https://main--geometrixx--adobe.aem.page').returns('#/adobe/geometrixx');
    try {
      await mount();
      for (let i = 0; i < 20 && !el._error; i += 1) await nextFrame();
      await el.updateComplete;
      expect(el.shadowRoot.querySelector('input').value).to.equal('https://main--geometrixx--adobe.aem.page');
      expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.equal('You need to sign in first.');
    } finally {
      window.history.replaceState(null, '', href);
    }
  });
});
