import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { default: init } = await import('../../../../blocks/landing/landing.js');
const content = await fetch('/test/fixtures/landing-tiles.html').then((response) => response.text());
const contentBlock = new DOMParser().parseFromString(content, 'text/html').querySelector('.landing');
const css = await fetch('/blocks/landing/landing.css').then((response) => response.text());
const styles = new CSSStyleSheet();
styles.replaceSync(css);

describe('landing background', () => {
  let el;
  let container;
  let originalStyles;

  const mountLanding = () => init(el, { contentBlock });

  beforeEach(() => {
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
  });

  it('replaces old content and composes authored tiles inside the landing surface', async () => {
    await mountLanding();
    expect(el.children.length).to.equal(1);
    expect(el.firstElementChild.className).to.equal('landing');
    const tiles = el.querySelector('.landing > da-landing-tiles');
    await tiles.updateComplete;
    expect(tiles.entries).to.have.length(5);
    expect(el.querySelector('img, picture')).to.equal(null);
  });

  it('does not mount tiles into a replaced surface', async () => {
    const mounting = mountLanding();
    el.replaceChildren();
    await mounting;
    expect(el.children).to.have.length(0);
  });

  it('hides an authored Landing table without replacing its rows', () => {
    const block = document.createElement('div');
    block.className = 'landing';
    block.innerHTML = '<div><div>row</div></div>';
    container.append(block);
    init(block);
    expect(block.hidden).to.equal(true);
    expect(block.innerHTML).to.equal('<div><div>row</div></div>');
  });

  it('fills its container with a wider warm left and narrow pink, fading to white at 85% height', () => {
    mountLanding();
    const surface = el.firstElementChild;
    const computed = getComputedStyle(surface);
    expect(surface.getBoundingClientRect().height).to.equal(400);
    expect(computed.opacity).to.equal('1');
    expect(computed.backgroundImage).to.match(
      /^linear-gradient\(.*25%, rgb\(255, 255, 255\) 85%\), linear-gradient\(to right,/,
    );
    ['rgb(255, 246, 245) 0%', 'rgb(255, 246, 245) 20%', 'rgb(255, 232, 247) 40%',
      'rgb(235, 238, 255) 50%', 'rgb(245, 249, 255) 100%']
      .forEach((color) => expect(computed.backgroundImage).to.include(color));
  });
});
