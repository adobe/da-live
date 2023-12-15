import getTitle from './title/view.js';
import { getPathDetails } from './shared/utils.js';
import './da-title/da-title.js';
import './da-content/da-content.js';

export default async function init(el) {
  let details = getPathDetails();
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

  window.addEventListener('hashchange', async () => {
    details = getPathDetails();
    daTitle.details = details;
    daContent.details = details;
  });
}
