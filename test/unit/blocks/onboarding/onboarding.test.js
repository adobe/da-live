import { expect } from '@esm-bundle/chai';

const { setNx, getNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { setImsResult } = await import(`${getNx()}/utils/ims.js`);
const { default: init } = await import('../../../../blocks/onboarding/onboarding.js');

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

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

  beforeEach(() => { savedIms = window.adobeIMS; });

  afterEach(() => {
    el.remove();
    window.adobeIMS = savedIms;
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

  it('greets without a name when the profile is unavailable', async () => {
    await mount();
    expect(el.shadowRoot.querySelector('h1').textContent).to.equal('Welcome to Experience Workspace');
  });

  it('greets the user by first name', async () => {
    setImsResult({ first_name: 'John' });
    await mount();
    for (let i = 0; i < 20 && !el._name; i += 1) await nextFrame();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('h1').textContent).to.equal('Welcome to Experience Workspace, John');
  });

  it('renders the four starting points', async () => {
    await mount();
    const tiles = [...el.shadowRoot.querySelectorAll('.tile')];
    expect(tiles.map((tile) => tile.querySelector('h3').textContent)).to.deep.equal([
      'Migrate or Redesign', 'Figma Design', 'Claude Design', 'AEM Boilerplate',
    ]);
    const link = tiles[3].querySelector('a.tile-action');
    expect(link.href).to.equal('https://github.com/adobe/aem-boilerplate');
    expect(link.target).to.equal('_blank');
    expect(tiles.slice(0, 3).every((tile) => tile.querySelector('button.tile-action').disabled)).to.be.true;
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

  it('rejects URLs that are not a GitHub repository or an AEM site', async () => {
    await mount();
    await typeUrl('https://example.com/adobe/geometrixx');
    el.shadowRoot.querySelector('form button').click();
    await el.updateComplete;
    const input = el.shadowRoot.querySelector('input');
    expect(el.shadowRoot.querySelector('#site-error').textContent)
      .to.equal('Enter a GitHub repository URL or an existing AEM site URL.');
    expect(input.getAttribute('aria-invalid')).to.equal('true');
    expect(input.getAttribute('aria-describedby')).to.equal('site-hint site-error');
  });

  it('shows the add site error and lets the user retry', async () => {
    window.adobeIMS = { isSignedInUser: () => false };
    await mount();
    await typeUrl('https://github.com/adobe/geometrixx');
    el.shadowRoot.querySelector('form button').click();
    await nextFrame();
    await el.updateComplete;
    const form = el.shadowRoot.querySelector('form');
    expect(form.classList.contains('nx-field-error')).to.be.true;
    expect(form.querySelector('[role="alert"]').textContent).to.equal('You need to sign in first.');
    expect(form.querySelector('button').disabled).to.be.false;

    await typeUrl('https://github.com/adobe/other');
    expect(form.querySelector('[role="alert"]')).to.be.null;
  });

  it('prefills and submits the site requested in the URL', async () => {
    const { href } = window.location;
    window.history.replaceState(null, '', '?org=adobe&site=geometrixx');
    window.adobeIMS = { isSignedInUser: () => false };
    try {
      await mount();
      for (let i = 0; i < 20 && !el._error; i += 1) await nextFrame();
      await el.updateComplete;
      expect(el.shadowRoot.querySelector('input').value).to.equal('https://github.com/adobe/geometrixx');
      expect(el.shadowRoot.querySelector('[role="alert"]').textContent).to.equal('You need to sign in first.');
    } finally {
      window.history.replaceState(null, '', href);
    }
  });
});
