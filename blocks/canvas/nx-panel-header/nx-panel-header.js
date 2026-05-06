import { loadStyle } from '../../shared/nxutils.js';

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

  const img = document.createElement('img');
  img.src = `/blocks/canvas/img/s2-icon-split${side}-20-n.svg`;
  img.setAttribute('aria-hidden', 'true');
  toggleBtn.append(img);

  toggleBtn.addEventListener('click', onClose);

  bar.append(start, toggleBtn);
  return bar;
}
