import { LitElement, html, nothing, until } from 'da-lit';
import { initIms } from '../shared/utils.js';

const FIRST_NAME = '[firstname]';

export class DaGreeting extends LitElement {
  static properties = {
    rows: { attribute: false },
    profile: { attribute: false },
    variant: { type: String },
  };

  createRenderRoot() {
    return this;
  }

  renderContent(content, firstName = 'User') {
    if (!content.length) return nothing;
    return html`${content.map(({ tag, text }) => {
      const el = document.createElement(tag);
      el.textContent = text.replaceAll(FIRST_NAME, () => firstName);
      return el;
    })}`;
  }

  render() {
    const rows = this.rows ?? [];
    const variant = rows.some(({ type }) => type === this.variant) ? this.variant : undefined;
    const content = rows
      .filter(({ type }) => type === variant)
      .flatMap((row) => row.content);
    const fallback = this.renderContent(content);
    if (!content.some(({ text }) => text.includes(FIRST_NAME)) || !this.profile) {
      return fallback;
    }
    const personalized = Promise.resolve(this.profile).then((profile) => {
      const firstName = !profile?.anonymous && typeof profile?.first_name === 'string'
        ? profile.first_name.trim() : '';
      return firstName ? this.renderContent(content, firstName) : fallback;
    }).catch(() => fallback);
    return until(personalized, nothing);
  }
}

customElements.define('da-greeting', DaGreeting);

export function createGreeting(el, { profile, variant } = {}) {
  const greeting = document.createElement('da-greeting');
  greeting.rows = [...el.children].map((row) => {
    const [first, second] = row.children;
    const content = [...(second ?? first).querySelectorAll('h1, h2, h3, h4, h5, h6, p')]
      .map((node) => ({ tag: node.localName, text: node.textContent }));
    return { type: second ? first.textContent.trim() : undefined, content };
  });
  greeting.profile = profile;
  greeting.variant = variant;
  greeting.className = el.className;
  el.replaceWith(greeting);
  return greeting;
}

async function initialize(el) {
  el.hidden = true;
  const profile = await initIms();
  const variant = profile?.accessToken && !profile.anonymous ? 'user' : undefined;
  return createGreeting(el, { profile, variant });
}

export default function init(el) {
  el.initialized ??= initialize(el);
  return el.initialized;
}
