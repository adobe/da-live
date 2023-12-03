import defaultContent from './default-content.js';
import { getTable } from '../utils.js';

function para() {
  return document.createElement('p');
}

export default async function getContent(path) {
  if (!path) return defaultContent();
  try {
    const resp = await fetch(`${path}`);
    if (resp.status !== 200) return defaultContent();
    const html = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Fix BRs
    const brs = doc.querySelectorAll('p br');
    brs.forEach((br) => { br.remove(); });

    // Fix blocks
    const blocks = doc.querySelectorAll('div[class]');
    blocks.forEach((block) => {
      const table = getTable(block);
      block.parentElement.replaceChild(table, block);
      table.insertAdjacentElement('beforebegin', para());
      table.insertAdjacentElement('afterend', para());
    });

    // Fix sections
    const sections = doc.body.querySelectorAll('main > div');
    return [...sections].map((section, idx) => {
      const fragment = new DocumentFragment();
      if (idx > 0) {
        const hr = document.createElement('hr');
        fragment.append(para(), hr, para());
      }
      fragment.append(...section.querySelectorAll(':scope > *'));
      return fragment;
    });
  } catch {
    return defaultContent();
  }
}
