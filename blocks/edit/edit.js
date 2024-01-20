import getPathDetails from '../shared/pathDetails.js';
import './da-title/da-title.js';
import './da-content/da-content.js';

function setUI(el) {
  el.innerHTML = '';
  const details = getPathDetails();
  if (!details) {
    el.classList.add('no-url');
    el.innerHTML = '<h1>Please edit a page.</h1>';
    return;
  }
  document.title = `Edit ${details.name} - Dark Alley`;

  // Title Pane
  const daTitle = document.createElement('da-title');
  daTitle.details = details;

  // Content Pane
  const daContent = document.createElement('da-content');
  daContent.details = details;

  // Inheritted Meta Pane
  const meta = document.createElement('div');
  meta.className = 'da-meta';

  el.append(daTitle, daContent, meta);
}

export default async function init(el) {
  setUI(el);

  window.addEventListener('hashchange', () => {
    setUI(el);
  });
}
