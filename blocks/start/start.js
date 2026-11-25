import { getNx } from '../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const sheet = await loadStyle(import.meta.url);

export default function init(el) {
  if (!document.adoptedStyleSheets.includes(sheet)) {
    document.adoptedStyleSheets.push(sheet);
  }
  const surface = el.closest('.section') ?? el.closest('.block-content');
  surface?.classList.add('start-page');
  surface?.querySelectorAll(':scope > .block-content > .nx-cards.start').forEach((cards) => {
    const group = cards.parentElement;
    const intro = group.previousElementSibling;
    if (group.firstElementChild !== cards || !intro?.matches('.default-content')
      || !intro.textContent.trim()
      || ![...intro.children].every((child) => child.matches('h1, h2, h3, h4, h5, h6, p'))) return;
    const panel = document.createElement('div');
    panel.className = 'start-cards-panel';
    cards.before(panel);
    panel.append(intro, cards);
  });
  el.hidden = true;
}
