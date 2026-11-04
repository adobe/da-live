import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { default: init } = await import('../../../../blocks/landing/landing.js');
const css = await fetch('/blocks/landing/landing.css').then((response) => response.text());
const styles = new CSSStyleSheet();
styles.replaceSync(css);

describe('landing background', () => {
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

  it('replaces old content with only an empty background surface', () => {
    init(el);
    expect(el.children.length).to.equal(1);
    expect(el.firstElementChild.className).to.equal('landing');
    expect(el.firstElementChild.childNodes.length).to.equal(0);
    expect(el.querySelector('img, picture')).to.equal(null);
  });

  it('fills its container with the opaque horizontal gradient below the lower-75% fade', () => {
    init(el);
    const surface = el.firstElementChild;
    const computed = getComputedStyle(surface);
    expect(surface.getBoundingClientRect().height).to.equal(400);
    expect(computed.opacity).to.equal('1');
    expect(computed.backgroundImage).to.match(
      /^linear-gradient\(.*25%, rgb\(255, 255, 255\) 100%\), linear-gradient\(to right,/,
    );
    ['rgb(255, 246, 245)', 'rgb(255, 232, 247)', 'rgb(235, 238, 255)', 'rgb(245, 249, 255)']
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
});
