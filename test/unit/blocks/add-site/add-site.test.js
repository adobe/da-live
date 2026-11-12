import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

const { setNx, getNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const background = new CSSStyleSheet();
const backgroundHref = new URL('../../../../blocks/landing/landing.css', import.meta.url).href;
loadStyle._set(backgroundHref, background);

const { default: init } = await import('../../../../blocks/add-site/add-site.js');

describe('add-site', () => {
  let block;
  let el;
  let openSite;

  const typeUrl = async (value) => {
    const input = el.shadowRoot.querySelector('input');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await el.updateComplete;
  };

  beforeEach(async () => {
    openSite = sinon.stub(customElements.get('da-add-site').prototype, 'openSite');
    block = document.createElement('div');
    block.innerHTML = '<div><div></div></div>';
    document.body.append(block);
    init(block);
    el = block.querySelector('da-add-site');
    await el.updateComplete;
  });

  afterEach(() => {
    block.remove();
    openSite.restore();
  });

  it('replaces the block content with the site form', () => {
    expect(block.children.length).to.equal(1);
    expect(el.shadowRoot.querySelector('label').textContent).to.equal('Already have an existing site?');
  });

  it('adds the landing background to the page once', () => {
    init(document.createElement('div'));
    expect(document.adoptedStyleSheets.filter((s) => s === background).length).to.equal(1);
  });

  it('enables Open once a URL is entered', async () => {
    const button = el.shadowRoot.querySelector('form button');
    expect(button.disabled).to.be.true;
    await typeUrl('  ');
    expect(button.disabled).to.be.true;
    await typeUrl('https://main--geometrixx--adobe.aem.page');
    expect(button.disabled).to.be.false;
  });

  it('rejects URLs that are not an AEM site', async () => {
    await typeUrl('https://github.com/adobe/geometrixx');
    el.shadowRoot.querySelector('form button').click();
    await el.updateComplete;
    const input = el.shadowRoot.querySelector('input');
    expect(el.shadowRoot.querySelector('#site-error').textContent)
      .to.equal('Enter an existing AEM site URL.');
    expect(input.getAttribute('aria-invalid')).to.equal('true');
    expect(input.getAttribute('aria-describedby')).to.equal('site-hint site-error');
    expect(openSite.called).to.be.false;
  });

  it('opens the site in Browse', async () => {
    await typeUrl('https://main--geometrixx--adobe.aem.page');
    el.shadowRoot.querySelector('form button').click();
    expect(openSite.calledOnceWith(`${window.location.origin}/#/adobe/geometrixx`)).to.be.true;
  });
});
