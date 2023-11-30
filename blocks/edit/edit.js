import getTitle from './title/view.js';
import { getHashParts } from './shared/utils.js';
import './da-content/da-content.js';

function getPath() {
  const { repo, owner, path } = getHashParts();
  return `https://main--${repo}--${owner}.hlx.page/${path}`;
}

export default async function init(el) {
  let path = getPath();

  // Title
  const title = await getTitle();

  // Edit & Preview
  const daContent = document.createElement('da-content');
  daContent.path = path;

  // Inheritted Meta
  const meta = document.createElement('div');
  meta.className = 'da-meta';

  el.append(title, daContent, meta);

  window.addEventListener('hashchange', async () => {
    const newTitle = await getTitle();
    el.replaceChild(newTitle, title);

    daContent.path = getPath();
  });
}
