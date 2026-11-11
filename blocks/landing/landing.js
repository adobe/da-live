import { getNx } from '../../scripts/utils.js';
import initGreeting from '../shared/da-greeting/da-greeting.js';
import { initIms } from '../shared/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const styles = await loadStyle(import.meta.url);

export default function init(el) {
  if (!document.adoptedStyleSheets.includes(styles)) document.adoptedStyleSheets.push(styles);
  const landing = document.createElement('div');
  landing.className = 'landing';
  const theme = new URLSearchParams(window.location.search).get('theme');
  if (['light', 'dark'].includes(theme)) landing.dataset.theme = theme;
  el.replaceChildren(landing);

  const greetings = el.closest('main')?.querySelectorAll('div.greeting');
  if (greetings?.length) {
    const profile = initIms();
    greetings.forEach((greeting) => initGreeting(greeting, { profile }));
  }
}
