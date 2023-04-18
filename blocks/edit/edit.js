import { origin } from '../browse/state/index.js';
import getTitle from './title/view.js';
import getToolbar from './toolbar/view.js';

const { getLibs } = await import('../../../scripts/utils.js');
const { createTag } = await import(`${getLibs()}/utils/utils.js`);

async function getContent(path) {
  const resp = await fetch(`${origin}${path}`);
  if (resp.status !== 200) return '';
  const html = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return [...doc.body.querySelectorAll(':scope > *')];
}

export default async function init(el) {
  const title = await getTitle();

  const dom = await getContent(window.location.hash.replace('#', ''));
  const editor = createTag('div', { class: 'da-editor', contenteditable: true, id: 'da-editor' }, dom);

  const meta = createTag('div', { class: 'da-meta' });

  const toolbar = await getToolbar(el);

  el.append(title, editor, meta, toolbar);
}
