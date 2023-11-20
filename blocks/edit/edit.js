import getTitle from './title/view.js';
import './da-content/da-content.js';

const { getLibs } = await import('../../../scripts/utils.js');
const { createTag } = await import(`${getLibs()}/utils/utils.js`);

function getPath() {
  const { hash } = window.location;
  return hash.replace('#', '');
}

export default async function init(el) {
  const path = getPath();

  const title = await getTitle();
  const daContent = createTag('da-content', { path });
  const meta = createTag('div', { class: 'da-meta' });

  el.append(title, daContent, meta);

  window.addEventListener('hashchange', () => {
    const newPath = getPath();
    daContent.setAttribute('path', newPath);
  });


  // const editor = createTag('div', { class: 'da-editor' });
  // const view = createTag('div', { class: 'da-view' });

  // const editView = createTag('div', { class: 'da-edit-view' }, editor);

  // const con = await getContent(hash.replace('#', ''));
  // const content = createTag('div', { id: 'content'}, con);

  // 
  // el.append(title, editView, meta);

  // initProse(editor, content);
}
