import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import '../../setup-nx.js';
import '../../../../blocks/landing/tile.js';

const sheet = new CSSStyleSheet();
await sheet.replace(await (await fetch('/blocks/landing/tile.css')).text());

describe('landing tile', () => {
  let tile;

  beforeEach(async () => {
    tile = document.createElement('da-landing-tile');
    tile.heading = 'Browse Content';
    tile.description = 'View your recent, favorite, or other content by their organization';
    tile.iconHref = '/img/icons/S2_Icon_DataStreams_20_N.svg';
    tile.style.cssText = `
      --s2-spacing-75: 4px;
      --s2-spacing-200: 12px;
      --s2-spacing-300: 16px;
      --s2-spacing-500: 32px;
      --s2-component-s-regular-font-size: 12px;
      --s2-component-m-regular-font-size: 14px;
      --s2-component-l-regular-font-size: 16px;
      --s2-component-xl-regular-font-size: 18px;
      --s2-body-line-height: 1.5;
      --s2-gray-25: light-dark(#fff, #111);
      --s2-gray-75: light-dark(#f3f3f3, #222);
      --s2-gray-900: light-dark(#292929, #eee);
      --s2-gray-600: light-dark(#717171, #aaa);
      --s2-blue-800: light-dark(#0265dc, #54a3ff);
      width: 348px;
    `;
    document.body.append(tile);
    await tile.updateComplete;
    tile.shadowRoot.adoptedStyleSheets = [sheet];
  });

  afterEach(() => tile.remove());

  it('renders icon, title and description without any interactive surface when no destination is provided', () => {
    expect(tile.shadowRoot.querySelector('h3').textContent).to.equal(tile.heading);
    expect(tile.shadowRoot.querySelector('p').textContent).to.equal(tile.description);
    expect(tile.shadowRoot.querySelector('.icon').getAttribute('aria-hidden')).to.equal('true');
    expect(tile.shadowRoot.querySelector('a, button, [tabindex], [role="link"], [role="button"]')).to.equal(null);
    expect(tile.tabIndex).to.equal(-1);
  });

  it('uses a native keyboard link only while a destination is supplied, skipping the following placeholder', async () => {
    const placeholder = document.createElement('da-landing-tile');
    const after = document.createElement('button');
    after.textContent = 'After tiles';
    document.body.append(placeholder, after);
    try {
      tile.href = '/?browse=2#/org/site';
      await tile.updateComplete;
      const link = tile.shadowRoot.querySelector('a');
      expect(new URL(link.href).hash).to.equal('#/org/site');
      link.focus();
      await sendKeys({ press: 'Tab' });
      expect(document.activeElement).to.equal(after);
      await sendKeys({ down: 'Shift' });
      await sendKeys({ press: 'Tab' });
      await sendKeys({ up: 'Shift' });
      expect(tile.shadowRoot.activeElement).to.equal(link);
      expect(link.matches(':focus-visible')).to.equal(true);
      expect(getComputedStyle(link).outlineStyle).to.equal('solid');
      expect(parseFloat(getComputedStyle(link).outlineWidth)).to.be.greaterThan(0);
      tile.href = undefined;
      await tile.updateComplete;
      expect(tile.shadowRoot.querySelector('a')).to.equal(null);
    } finally {
      placeholder.remove();
      after.remove();
    }
  });

  it('supports light/dark surfaces and its own S/M title, description and icon sizes', async () => {
    const surface = tile.shadowRoot.querySelector('.tile');
    const icon = tile.shadowRoot.querySelector('.icon');
    const title = tile.shadowRoot.querySelector('h3');
    const description = tile.shadowRoot.querySelector('p');
    tile.style.colorScheme = 'light';
    const lightSurface = getComputedStyle(surface).backgroundColor;
    const lightIcon = getComputedStyle(icon).color;
    tile.style.colorScheme = 'dark';
    expect(getComputedStyle(surface).backgroundColor).not.to.equal(lightSurface);
    expect(getComputedStyle(icon).color).not.to.equal(lightIcon);
    const smallIcon = parseFloat(getComputedStyle(icon, '::before').width);
    const smallTitle = parseFloat(getComputedStyle(title).fontSize);
    const smallText = parseFloat(getComputedStyle(description).fontSize);
    tile.size = 'm';
    await tile.updateComplete;
    expect(parseFloat(getComputedStyle(icon, '::before').width)).to.equal(smallIcon + 2);
    expect(parseFloat(getComputedStyle(title).fontSize)).to.equal(smallTitle + 2);
    expect(parseFloat(getComputedStyle(description).fontSize)).to.equal(smallText + 2);
  });

  it('uses shared palette and surface tokens instead of fixed component colors', async () => {
    tile.style.setProperty('--s2-turquoise-200', 'light-dark(#d1f5f5, #002529)');
    tile.style.setProperty('--s2-purple-200', 'light-dark(#f4ebfc, #320060)');
    const surface = tile.shadowRoot.querySelector('.tile');
    const icon = tile.shadowRoot.querySelector('.icon');
    tile.style.colorScheme = 'light';
    expect(getComputedStyle(surface).backgroundColor).to.equal('rgb(255, 255, 255)');
    expect(getComputedStyle(icon).backgroundColor).to.equal('rgb(209, 245, 245)');
    tile.style.colorScheme = 'dark';
    expect(getComputedStyle(surface).backgroundColor).to.equal('rgb(34, 34, 34)');
    expect(getComputedStyle(icon).backgroundColor).to.equal('rgb(0, 37, 41)');
    tile.tone = 'purple';
    await tile.updateComplete;
    expect(getComputedStyle(icon).backgroundColor).to.equal('rgb(50, 0, 96)');
    tile.style.setProperty('--s2-purple-200', 'rgb(80 40 100)');
    tile.style.setProperty('--s2-gray-75', 'rgb(40 40 40)');
    expect(getComputedStyle(icon).backgroundColor).to.equal('rgb(80, 40, 100)');
    expect(getComputedStyle(surface).backgroundColor).to.equal('rgb(40, 40, 40)');
  });

  it('activates a native action button with Enter or Space, but never when disabled', async () => {
    tile.action = true;
    tile.actionId = 'create-page';
    await tile.updateComplete;
    const clicks = [];
    const button = tile.shadowRoot.querySelector('button');
    button.addEventListener('click', (event) => clicks.push(event));
    button.focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'Space' });
    expect(clicks).to.have.length(2);
    tile.disabled = true;
    await tile.updateComplete;
    button.click();
    expect(clicks).to.have.length(2);
    expect(tile.shadowRoot.querySelector('a')).to.equal(null);
  });
});
