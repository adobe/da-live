import getPathDetails from '../shared/pathDetails.js';
import './da-title/da-title.js';

async function setUI(el) {
  el.innerHTML = '';
  const details = getPathDetails();
  if (!details) {
    el.classList.add('no-url');
    el.innerHTML = '<h1>Please edit a page.</h1>';
    return;
  }
  document.title = `Edit ${details.name} - DA`;

  // Title Pane
  const daTitle = document.createElement('da-title');
  daTitle.details = details;
  el.append(daTitle);

  // Content Pane
  await import('./da-content/da-content.js');
  const daContent = document.createElement('da-content');
  daContent.details = details;
  el.append(daContent);
}

export default async function init(el) {
  setUI(el);

  window.addEventListener('hashchange', () => {
    setUI(el);
  });
}
