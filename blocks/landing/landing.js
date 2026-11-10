import { getNx } from '../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const styles = await loadStyle(import.meta.url);

export default async function init(el, { contentBlock } = {}) {
  // An authored Landing table supplies tile content, not a second surface.
  if (el.classList.contains('landing')) {
    el.hidden = true;
    return;
  }
  if (!document.adoptedStyleSheets.includes(styles)) document.adoptedStyleSheets.push(styles);
  const landing = document.createElement('div');
  landing.className = 'landing';
  const theme = new URLSearchParams(window.location.search).get('theme');
  if (['light', 'dark'].includes(theme)) landing.dataset.theme = theme;
  el.replaceChildren(landing);
  const { default: loadTiles } = await import('./tile-group.js');
  if (landing.isConnected) loadTiles(landing, { contentBlock });
}
