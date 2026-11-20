import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../shared/sheet.js';
import initGreeting from '../greeting/greeting.js';

const sheet = await getSheet('/blocks/start/start.css');

class DaStart extends LitElement {
  static properties = { content: { state: true } };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  render() {
    const { cards, heading, description } = this.content ?? {};
    return html`
      <div class="authored-layout">
        <slot name="greeting"></slot>
        <slot name="add-site"></slot>
        ${cards ? html`
          <div class="cards-panel">
            ${heading || description ? html`
              <div class="cards-intro">
                ${heading || nothing}
                ${description || nothing}
              </div>
            ` : nothing}
            <slot name="cards"></slot>
          </div>
        ` : nothing}
      </div>
    `;
  }
}

customElements.define('da-start', DaStart);

export default function init(el) {
  const start = document.createElement('da-start');
  const section = el.closest('.section');
  const findBlock = (selector) => section?.querySelector(selector)
    || section?.nextElementSibling?.querySelector(selector);
  const addSite = findBlock('div.add-site');
  const cards = findBlock('div.nx-cards.start');
  const greetingEl = findBlock('div.greeting, da-greeting');
  const intro = cards?.closest('.block-content')?.previousElementSibling;
  const heading = intro?.matches('.default-content')
    ? intro.querySelector('h1, h2, h3, h4, h5, h6') : undefined;
  const description = intro?.matches('.default-content') ? intro.querySelector('p') : undefined;
  start.content = { cards, heading, description };

  // The host supplies the panel surface instead of the standalone cards variant.
  cards?.classList.remove('start');
  [
    [addSite, 'add-site'],
    [cards, 'cards'],
  ].forEach(([node, slot]) => {
    if (!node) return;
    node.slot = slot;
    start.append(node);
  });
  [heading, description].forEach((node) => {
    if (node) start.append(node);
  });

  el.append(start);
  if (!greetingEl) return;
  const greetingPromise = greetingEl.matches('da-greeting')
    ? Promise.resolve(greetingEl) : initGreeting(greetingEl);
  greetingPromise.then((greeting) => {
    greeting.slot = 'greeting';
    start.append(greeting);
  });
}
