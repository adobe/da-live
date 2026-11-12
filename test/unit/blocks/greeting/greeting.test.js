import { expect } from '@esm-bundle/chai';
import '../../setup-nx.js';
import init from '../../../../blocks/greeting/greeting.js';
import { getNx2 } from '../../../../scripts/utils.js';

const { loadIms } = await import(`${getNx2()}/utils/ims.js`);

describe('greeting page block', () => {
  let container;
  let sheets;

  beforeEach(() => {
    sheets = [...document.adoptedStyleSheets];
    container = document.createElement('main');
    container.innerHTML = '<div class="greeting"><div><div><h1>Welcome, [firstname]</h1><p>Add your site.</p></div></div></div>';
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
    document.body.classList.remove('ui-size-m');
    document.adoptedStyleSheets = sheets;
    loadIms.reset();
    loadIms.resolves({ accessToken: { token: 'test-token' } });
  });

  it('renders the authored greeting without waiting for the profile', async () => {
    let finish;
    const profile = new Promise((resolve) => { finish = resolve; });
    loadIms.returns(profile);
    const greeting = init(container.firstElementChild);
    expect(container.querySelectorAll('da-greeting').length).to.equal(1);
    expect(greeting.profile).to.equal(profile);
    await greeting.updateComplete;
    expect(greeting.textContent).to.equal('');

    finish({ first_name: 'Ada' });
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(greeting.querySelector('h1').textContent).to.equal('Welcome, Ada');
    expect(greeting.querySelector('p').textContent).to.equal('Add your site.');
  });

  it('applies layout and size changes only on Start', async () => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(await (await fetch('/blocks/greeting/greeting.css')).text());
    document.adoptedStyleSheets.push(sheet);
    container.style.cssText = '--s2-heading-size-s: 20px; --s2-heading-size-m: 22px;';
    loadIms.resolves({ first_name: 'Ada' });
    const greeting = init(container.firstElementChild);
    await greeting.updateComplete;
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    const heading = greeting.querySelector('h1');
    const originalSize = getComputedStyle(heading).fontSize;
    expect(getComputedStyle(greeting).textAlign).not.to.equal('center');

    const addSite = document.createElement('div');
    addSite.className = 'add-site';
    container.append(addSite);
    expect(getComputedStyle(greeting).textAlign).to.equal('center');
    expect(getComputedStyle(heading).fontSize).to.equal('20px');
    document.body.classList.add('ui-size-m');
    expect(getComputedStyle(heading).fontSize).to.equal('22px');
    addSite.remove();
    expect(getComputedStyle(greeting).textAlign).not.to.equal('center');
    expect(getComputedStyle(heading).fontSize).to.equal(originalSize);
  });
});
