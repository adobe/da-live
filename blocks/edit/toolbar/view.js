import { makeLink, makeUl, makeOl, makeBr, makeBlock } from './index.js';

const { getLibs } = await import('../../../../scripts/utils.js');
const { createTag } = await import(`${getLibs()}/utils/utils.js`);
const { html, render } = await import(`${getLibs()}/deps/htm-preact.js`);

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
