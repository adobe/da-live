import { getLibs } from '../../../scripts/utils.js';
import { content, breadcrumbs, create, resetCreate } from '../state/index.js';
import {
  getContent,
  handleAction,
  handleHash,
  handleCrumb,
  handleChange,
  showCreateMenu,
  handleNewType,
  handleSave,
} from './index.js';

const { html, useEffect } = await import(`${getLibs()}/deps/htm-preact.js`);

function CreateAction() {
  const { show, name, type } = create.value;

  return html`
    <div class="da-actions-create ${show}">
      <button class="da-actions-new-button" onClick=${showCreateMenu}>New</button>
      <ul class="da-actions-menu">
        <li class=da-actions-menu-item><button data-type=folder onClick=${handleNewType}>Folder</button></li>
        <li class=da-actions-menu-item><button data-type=document onClick=${handleNewType}>Document</button></li>
      </ul>
      <div class="da-actions-input-container">
        <input onInput=${handleChange} type="text" class="da-actions-input" placeholder="Name" value=${name} />
        <button class="da-actions-button" onClick=${handleSave}>Create ${type}</button>
        <button class="da-actions-button da-actions-button-cancel" onClick=${resetCreate}>Cancel</button>
      </div>
    </div>`;
}

export default function Browser() {
  useEffect(() => {
    handleHash();
    getContent();
  }, []);

  return html`
    <hr class=da-rule/>
    <div class=da-breadcrumb>
      <ul class=da-breadcrumb-list>
        ${breadcrumbs.value.map((crumb, idx) => html`
          <li
            class=da-breadcrumb-list-item
            onClick=${() => handleCrumb(crumb)}
            key=${idx}>
            ${crumb.name}
          </li>
        `)}
      </ul>
      <${CreateAction} />
    </div>
    <ul class=da-item-list>
      ${content.value.map((item, idx) => html`
        <li
          class=da-item-list-item
          key=${idx}>
          <input type="checkbox" style="display: none" name="select" />
          <div class="da-item-list-item-title" onClick=${() => handleAction(item)}>
            <span class="da-item-list-item-type da-item-list-item-type-${item.type}"/>
            ${item.name}
          </div>
        </li>
      `)}
    </ul>
    <hr class=da-rule/>
  `;
}
