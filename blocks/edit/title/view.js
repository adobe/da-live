import { open, handleAction } from './index.js';

const { getLibs } = await import('../../../scripts/utils.js');
const { createTag } = await import(`${getLibs()}/utils/utils.js`);
const { html, render } = await import(`${getLibs()}/deps/htm-preact.js`);

function Title({ filename }) {
  return html`
    <div class=da-header>
      <h1 class=da-header-name>${filename}</h1>
    </div>
    <div class=da-header-actions>
      <button
        onClick=${() => {handleAction('preview')}}
        class="con-button blue da-header-actions-publish"
        aria-label="Send">
        Preview
      </button>
      <button
      onClick=${() => {handleAction('publish')}}
        class="con-button blue da-header-actions-publish"
        aria-label="Send">
        Publish
      </button>
      <button
        onClick=${() => {handleAction('preview')}}
        class="con-button blue da-header-actions-send"
        aria-label="Send">
        <span class="da-header-actions-send-icon"></span>
      </button>
    </div>
  `;
}


export default async function init() {
  const el = createTag('div', { class: 'da-header-wrapper' });

  const { hash } = window.location;
  const filename = hash.split('/').pop();

  render(html`<${Title} filename=${filename} />`, el);
  return el;
}
