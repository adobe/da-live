import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse } from '@web/test-runner-commands';
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
    tile.iconHref = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22%3E%3Crect width=%2220%22 height=%2220%22/%3E%3C/svg%3E';
    tile.style.width = '348px';
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
      tile.href = undefined;
      await tile.updateComplete;
      expect(tile.shadowRoot.querySelector('a')).to.equal(null);
      // eslint-disable-next-line no-script-url
      tile.href = 'javascript:alert(1)';
      await tile.updateComplete;
      expect(tile.shadowRoot.querySelector('a')).to.equal(null);
    } finally {
      placeholder.remove();
      after.remove();
    }
  });

  it('activates a native action button with Enter or Space, but never when disabled', async () => {
    tile.action = true;
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

  it('sends clicks on the icon, title or description to the link or button', async () => {
    const clicks = [];
    tile.shadowRoot.addEventListener('click', (event) => {
      event.preventDefault();
      clicks.push(event.target);
    });
    for (const action of [false, true]) {
      tile.href = action ? undefined : '/?browse=2#/org/site';
      tile.action = action;
      await tile.updateComplete;
      const surface = tile.shadowRoot.querySelector('a, button');
      for (const selector of ['.icon', 'h3', 'p']) {
        const bounds = tile.shadowRoot.querySelector(selector).getBoundingClientRect();
        await sendMouse({
          type: 'click',
          position: [
            Math.round(bounds.x + bounds.width / 2),
            Math.round(bounds.y + bounds.height / 2),
          ],
        });
        expect(clicks.at(-1)).to.equal(surface);
      }
      surface.focus();
      await sendKeys({ press: 'Enter' });
      expect(clicks.at(-1)).to.equal(surface);
    }
    expect(clicks).to.have.length(8);
  });
});
