import { origin } from '../browse/state/index.js';
import getTitle from './title/view.js';
import getToolbar from './toolbar/view.js';
import { getTable } from './utils.js';

const { getLibs } = await import('../../../scripts/utils.js');
const { createTag, loadScript } = await import(`${getLibs()}/utils/utils.js`);

const WYSIHTML = [

];

async function getContent(path) {
  try {
    const resp = await fetch(`${origin}${path}`);
    if (resp.status !== 200) return '';
    const html = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

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
    return '';
  }
}

function defaultContent() {
  return `
  <table>
    <tbody><tr>
      <td colspan="2">columns</td>
    </tr>
    <tr>
      <td>Lorem ipsum...</td>
      <td>Lorem ipsum...</td>
    </tr></tbody>
  </table>
  <br>
  <hr>
  <br>
  <table>
  <tbody><tr>
    <td colspan="2" class="">columns (table)</td>
  </tr>
  <tr>
    <td class="">Lorem ipsum...</td>
    <td class="">Lorem ipsum...</td>
  </tr><tr><td class="">&nbsp;Hello</td><td class="">&nbsp;Hello again</td></tr></tbody></table><br>
  <hr><br><table>
  <tbody><tr>
    <td colspan="2" class="">columns (contained)</td>
  </tr>
  <tr>
    <td class="">Lorem ipsum...</td>
    <td class="">Lorem ipsum...</td>
  </tr><tr><td class="">&nbsp;another</td><td class="">&nbsp;another</td></tr></tbody></table><br>`;
}

export default async function init(el) {
  const title = await getTitle();

  const toolbar = await getToolbar(el);

  const editor = createTag('div', { class: 'da-editor' });
  const wrapper = createTag('div', { class: 'da-editor-wrapper' }, [ toolbar, editor ]);

  const meta = createTag('div', { class: 'da-meta' });

  await loadScript('/blocks/edit/deps/wysihtml/wysihtml.js');
  await loadScript('/blocks/edit/deps/wysihtml/wysihtml.all-commands.js');
  await loadScript('/blocks/edit/deps/wysihtml/wysihtml.table_editing.js');
  await loadScript('/blocks/edit/deps/wysihtml/wysihtml.toolbar.js');
  await loadScript('/blocks/edit/deps/wysihtml/advanced_and_extended.js');

  const opts = {
    toolbar,
    parserRules:  wysihtmlParserRules,
    useLineBreaks: true,
  };
  new wysihtml.Editor(editor, opts);

  const dom = await getContent(window.location.hash.replace('#', ''));
  editor.append(dom[0]);

  el.append(title, wrapper, meta);
}
