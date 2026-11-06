import { expect } from '@esm-bundle/chai';
import '../../setup-nx.js';
import init from '../../../../blocks/landing/landing.js';

const styles = new CSSStyleSheet();
styles.replaceSync(await fetch('/blocks/landing/landing.css').then((response) => response.text()));

describe('landing background with Content', () => {
  let el;
  let container;
  let originalStyles;
  let originalHref;

  beforeEach(() => {
    originalHref = window.location.href;
    originalStyles = document.adoptedStyleSheets;
    document.adoptedStyleSheets = [...originalStyles, styles];
    el = document.createElement('div');
    el.className = 'browse';
    container = document.createElement('div');
    container.style.height = '400px';
    container.innerHTML = '<div class="section"><div class="block-content"></div></div>';
    container.querySelector('.block-content').append(el);
    el.style.setProperty('--s2-red-100', '#fff6f5');
    el.style.setProperty('--s2-pink-200', '#ffe8f7');
    el.style.setProperty('--s2-indigo-200', '#ebeeff');
    el.style.setProperty('--s2-blue-100', '#f5f9ff');
    el.style.setProperty('--s2-gray-25', '#fff');
    el.innerHTML = '<picture><img alt="Old background"></picture>';
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
    document.adoptedStyleSheets = originalStyles;
    document.body.classList.remove('dark-scheme');
    history.replaceState(null, '', originalHref);
  });

  it('replaces old content with Content inside the existing background surface', async () => {
    const content = init(el);
    await content.updateComplete;
    expect(el.children.length).to.equal(1);
    expect(el.firstElementChild.className).to.equal('landing');
    expect(el.firstElementChild.firstElementChild).to.equal(content);
    expect(content.shadowRoot.querySelector('#files-heading').textContent).to.equal('Content');
    expect(el.querySelector('img, picture')).to.equal(null);
  });

  it('fills its container and preserves the gradient positions from main', () => {
    init(el);
    const surface = el.firstElementChild;
    const computed = getComputedStyle(surface);
    expect(surface.getBoundingClientRect().height).to.be.at.least(400);
    expect(computed.opacity).to.equal('1');
    expect(computed.backgroundImage).to.match(
      /^linear-gradient\(.*25%, rgb\(255, 255, 255\) 85%\), linear-gradient\(to right,/,
    );
    ['rgb(255, 246, 245) 0%', 'rgb(255, 246, 245) 20%', 'rgb(255, 232, 247) 40%',
      'rgb(235, 238, 255) 50%', 'rgb(245, 249, 255) 100%']
      .forEach((color) => expect(computed.backgroundImage).to.include(color));
  });

  it('keeps the dark scheme scoped to the mounted landing surface', () => {
    document.body.classList.add('dark-scheme');
    const before = getComputedStyle(document.body).colorScheme;
    init(el);
    expect(getComputedStyle(document.body).colorScheme).to.equal('dark');
    el.replaceChildren();
    expect(getComputedStyle(document.body).colorScheme).to.equal(before);
  });

  it('previews light mode without changing the saved theme or other pages', () => {
    const savedTheme = localStorage.getItem('color-scheme');
    document.body.classList.add('dark-scheme');
    history.replaceState(null, '', '?theme=light');
    init(el);
    expect(getComputedStyle(document.body).colorScheme).to.equal('light');
    expect(localStorage.getItem('color-scheme')).to.equal(savedTheme);
    el.replaceChildren();
    expect(getComputedStyle(document.body).colorScheme).not.to.equal('light');
  });

  it('previews dark mode without changing the saved theme or other pages', () => {
    const savedTheme = localStorage.getItem('color-scheme');
    const before = getComputedStyle(document.body).colorScheme;
    history.replaceState(null, '', '?theme=dark');
    init(el);
    expect(getComputedStyle(document.body).colorScheme).to.equal('dark');
    expect(localStorage.getItem('color-scheme')).to.equal(savedTheme);
    el.replaceChildren();
    expect(getComputedStyle(document.body).colorScheme).to.equal(before);
  });

  it('mirrors light and dark positions with the original middle colors', () => {
    init(el);
    const lightPositions = getComputedStyle(el.firstElementChild).backgroundImage.match(/[\d.]+%/g);
    history.replaceState(null, '', '?theme=dark');
    el.style.setProperty('--s2-red-100', 'light-dark(#fff6f5, #360a03)');
    el.style.setProperty('--s2-pink-200', 'light-dark(#ffe8f7, #47002c)');
    el.style.setProperty('--s2-indigo-200', 'light-dark(#ebeeff, #23006e)');
    el.style.setProperty('--s2-blue-100', 'light-dark(#f5f9ff, #0e173f)');
    el.style.setProperty('--s2-gray-25', 'light-dark(#fff, #111)');
    init(el);
    const background = getComputedStyle(el.firstElementChild).backgroundImage;
    expect(background.match(/[\d.]+%/g)).to.deep.equal(lightPositions);
    expect(background).to.include('rgb(71, 0, 44) 40%');
    expect(background).to.include('rgb(35, 0, 110) 50%');
    expect(background).to.include('rgb(17, 17, 17) 85%');
  });
});
