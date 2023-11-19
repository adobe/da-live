import { origin } from '../browse/state/index.js';
import initProse from './prose/index.js';
import getTitle from './title/view.js';
import { getTable } from './utils.js';
import defaultContent from './mock/default-content.js';

const { getLibs } = await import('../../../scripts/utils.js');
const { createTag } = await import(`${getLibs()}/utils/utils.js`);

async function getContent(path) {
  try {
    const resp = await fetch(`${origin}${path}`);
    if (resp.status !== 200) return defaultContent();
    const html = await resp.text();
    if (!html) return defaultContent();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Fix BRs
    const brs = doc.querySelectorAll('p br');
    brs.forEach((br) => {
      br.remove();
    });

    // Fix blocks
    const blocks = doc.querySelectorAll('div[class]');
    blocks.forEach((block) => {
      const table = getTable(block);
      block.parentElement.replaceChild(table, block);
    });

    // Fix sections
    const sections = doc.body.querySelectorAll('main > div');
    return [...sections].map((section, idx) => {
      const fragment = new DocumentFragment();
      if (idx > 0) fragment.append(document.createElement('hr'));
      fragment.append(...section.querySelectorAll(':scope > *'));
      return fragment;
    });
  } catch {
    return defaultContent();
  }
}

export default async function init(el) {
  const { hash } = window.location;

  const title = await getTitle();
  const editor = createTag('div', { class: 'da-editor' });

  const con = hash ? await getContent(hash.replace('#', '')) : defaultContent();
  const content = createTag('div', { id: 'edit'}, con);

  const meta = createTag('div', { class: 'da-meta' });
  el.append(title, editor, meta);

  initProse(editor, content);
}
