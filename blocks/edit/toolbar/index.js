const { getLibs } = await import('../../../scripts/utils.js');
const { createTag } = await import(`${getLibs()}/utils/utils.js`);

export function isInEditor(node) {
  if (node?.id === 'da-editor') return true;
  const closest = node?.parentElement.closest('#da-editor');
  if (closest) return true;
  return false;
}

export function insert(dom) {
  const sel = window.getSelection();
  const inEditor = isInEditor(sel.anchorNode);

  if (inEditor) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(dom);
  } else {
    const editor = document.querySelector('#da-editor');
    editor.append(dom);
  }
}

export function makeUl() {
  const dom = createTag('ul', null, '<li></li>');
  insert(dom);
}

export function makeOl() {
  const dom = createTag('ol', null, '<li></li>');
  insert(dom);
}

export function makeBr() {
  const dom = createTag('hr', null);
  insert(dom);
}

export function makeLink() {
  const dom = createTag('a', { href: 'https://www.adobe.com' }, 'Adobe Inc');
  insert(dom);
}

export function makeBlock() {
  const content =
  `<table cellspacing="4">
    <tr>
      <th colspan="2">columns</th>
    </tr>
    <tr>
      <td>Lorem ipsum...</td>
      <td>Lorem ipsum...</td>
    </tr>
  </table>
  `;
  const dom = createTag('table', null, content);
  insert(dom);
}
