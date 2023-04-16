import { getLibs } from '../../../scripts/utils.js';
import { content, breadcrumbs, showFolder, newFolder } from '../state/index.js';
import {
  getContent,
  handleAction,
  handleHash,
  handleCrumb,
  handleChange,
  expandFolder,
  handleSave,
  handleCancel,
} from './index.js';

const { html, useEffect } = await import(`${getLibs()}/deps/htm-preact.js`);


export default function Browser() {
  useEffect(() => {
    handleHash();
    getContent();
  }, []);

  const editFolder = showFolder.value ? ' edit-folder' : '';

  return html`
    <hr class=da-rule/>
    <div class=da-breadcrumb-actions>
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
      <div class=da-actions-container>
        <button class="da-actions-button${editFolder}" onClick=${expandFolder}>New</button>
        <div class="da-actions-folder-container${editFolder}">
          <input onInput=${handleChange} type="text" class="da-actions-input" placeholder="folder name" value=${newFolder} />
          <button class="da-actions-button" onClick=${handleSave}>Save</button>
          <button class="da-actions-button da-actions-button-cancel" onClick=${handleCancel}>Cancel</button>
        </div>
      </div>
    </div>
    <ul class=da-item-list>
      ${content.value.map((item, idx) => html`
        <li
          class=da-item-list-item
          key=${idx}
          onClick=${() => handleAction(item)}>
          <span class="da-item-list-item-type da-item-list-item-type-${item.type}"/>
        ${item.name}</li>
      `)}
    </ul>
    <hr class=da-rule/>
  `;
}