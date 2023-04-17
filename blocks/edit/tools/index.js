const { getLibs } = await import('../../../../scripts/utils.js');
const { createTag } = await import(`${getLibs()}/utils/utils.js`);
const { html, render } = await import(`${getLibs()}/deps/htm-preact.js`);

function isInEditor(node) {
  if (node?.id === 'da-editor') return true;
  const closest = node?.parentElement.closest('#da-editor');
  if (closest) return true;
  return false;
}

function insert(dom) {
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

  dom.focus();
}

function makeUl() {
  const dom = createTag('ul', null, '<li></li>');
  insert(dom);
}

function makeOl() {
  const dom = createTag('ol', null, '<li></li>');
  insert(dom);
}

function makeBr() {
  const dom = createTag('hr', null);
  insert(dom);
}

function makeLink() {
  const dom = createTag('a', { href: 'https://www.adobe.com' }, 'Adobe Inc');
  insert(dom);
}

function makeBlock() {
  const children = '<div><div>Block Name</div></div><div><div>Content 1</div><div>Content 2</div></div>';
  const dom = createTag('div', { class: 'block' }, children);
  insert(dom);
}

function Toolbar() {
  return html`
    <button
      data-label="Link"
      aria-label="Add link"
      onClick=${makeLink}
      class="da-editor-tool da-editor-tool-a"/>
    <button
      data-label="Unorderd list"
      aria-label="Add unordered list"
      onClick=${makeUl}
      class="da-editor-tool da-editor-tool-ul"/>
    <button
      data-label="Orderd list"
      aria-label="Add ordered list"
      onClick=${makeOl}
      class="da-editor-tool da-editor-tool-ol"/>
    <button
      data-label="Section break"
      aria-label="Add section break"
      onClick=${makeBr}
      class="da-editor-tool da-editor-tool-hr"/>
    <button
      data-label="Block"
      aria-label="Add empty block"
      onClick=${makeBlock}
      class="da-editor-tool da-editor-tool-block"/>
    <hr/>
    <button
      data-label="Libraries"
      aria-label="Open library"
      class="da-editor-tool da-editor-tool-library"/>
  `;
}

export default async function init() {
  const el = createTag('div', { class: 'da-editor-tools' });
  render(html`<${Toolbar} />`, el);
  return el;
}