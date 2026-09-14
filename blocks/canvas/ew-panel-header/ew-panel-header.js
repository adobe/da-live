import { getNx } from '../../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

export default function createPanelHeader({ position, onClose }) {
  if (!document.adoptedStyleSheets.includes(style)) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];
  }
  const side = position === 'before' ? 'left' : 'right';

  const bar = document.createElement('div');
  bar.className = 'panel-header';

  const start = document.createElement('div');
  start.className = 'panel-header-custom';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'panel-header-toggle';
  toggleBtn.setAttribute('aria-label', `Toggle ${position} panel`);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', '0 0 20 20');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `/blocks/canvas/img/s2-icon-split${side}-20-n.svg#icon`);
  svg.append(use);
  toggleBtn.append(svg);

  toggleBtn.addEventListener('click', onClose);

  bar.append(start, toggleBtn);
  return bar;
}
