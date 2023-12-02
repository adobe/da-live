import getTitle from './title/view.js';
import { getPathDetails } from './shared/utils.js';
import './da-content/da-content.js';

export default async function init(el) {
  const details = getPathDetails();
  if (!details) {
    el.classList.add('no-url');
    el.innerHTML = '<h1>Please edit a page.</h1>';
    return;
  }

  document.title = `Edit ${details.name} - Dark Alley`;

  // Title Pane
  const title = await getTitle();

  // Content Pane
  const daContent = document.createElement('da-content');
  daContent.details = details;

  // Inheritted Meta Pane
  const meta = document.createElement('div');
  meta.className = 'da-meta';

  el.append(title, daContent, meta);

  window.addEventListener('hashchange', async () => {
    const newTitle = await getTitle();
    el.replaceChild(newTitle, title);
    daContent.details = getPathDetails();
  });
}
