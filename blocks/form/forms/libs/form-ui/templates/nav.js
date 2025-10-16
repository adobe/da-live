import { html, nothing } from 'da-lit';
import { UI_CLASS as CLASS } from '../constants.js';

export const navItemTemplate = ({ groupId, level = 0, title = '' } = {}) => html`
  <div class="${CLASS.navItem}" data-group-id=${groupId} data-level=${String(level)}>
    <div class="${CLASS.navItemContent}" style=${`--nav-level:${level}`}>
      <span class="${CLASS.navItemTitle}">${title}</span>
    </div>
  </div>
`;

export const navAddItemTemplate = ({ path, groupId, level = 0, title = '' } = {}) => html`
  <div class="${CLASS.navItem} ${CLASS.navItemAdd}" data-group-id=${groupId} data-path=${path} data-level=${String(level)}>
    <div class="${CLASS.navItemContent} ${CLASS.navItemAddContent}" style=${`--nav-level:${level}`}>
      <span class="${CLASS.navItemTitle} ${CLASS.navItemAddTitle}">${title}</span>
    </div>
  </div>
`;

export const navArrayChildItemTemplate = ({ groupId, level = 0, arrayPath = '', itemIndex = 0, title = '' } = {}) => html`
  <div class="${CLASS.navItem} ${CLASS.navItemArrayChild}" data-group-id=${groupId} data-level=${String(level)} data-array-path=${arrayPath} data-item-index=${String(itemIndex)}>
    <div class="${CLASS.navItemContent}" style=${`--nav-level:${level}`} draggable="true">
      <span class="${CLASS.navItemTitle}">${title}</span>
    </div>
  </div>
`;

export const navSectionTitleTemplate = ({ groupId, level = 0, path = '', title = '' } = {}) => html`
  <div class="form-ui-nav-item form-ui-section-title-nav" data-group-id=${groupId} data-level=${String(level)} data-path=${path}>
    <div class="form-ui-nav-item-content" style=${`--nav-level:${level}`}>
      <span class="form-ui-nav-item-title">${title}</span>
    </div>
  </div>
`;

const renderListItems = (items = []) => html`${items.map((item) => html`
  <li class=${item.className || ''} data-group-id=${item.dataset?.groupId || nothing}
      data-path=${item.dataset?.path ?? nothing}
      data-level=${item.dataset?.level ?? nothing}
      data-array-path=${item.dataset?.arrayPath ?? nothing}
      data-item-index=${item.dataset?.itemIndex ?? nothing}
      draggable=${item.draggable ? 'true' : nothing}>
    ${item.node}
    ${item.children && item.children.length ? navListTemplate(item.children) : nothing}
  </li>`)}
`;

export const navListTemplate = (items = []) => html`
  <ul class="form-nav-tree">${renderListItems(items)}</ul>
`;

export const breadcrumbItemTemplate = ({ text = '', path = null, groupId = null, onClick } = {}) => html`
  <button
    type="button"
    class="form-ui-breadcrumb-item"
    data-path=${path ?? nothing}
    data-group-id=${groupId ?? nothing}
    @click=${onClick}
  >${text}</button>
`;

export const breadcrumbSeparatorTemplate = () => html`<span> › </span>`;

export default {
  navItemTemplate,
  navAddItemTemplate,
  navArrayChildItemTemplate,
  navSectionTitleTemplate,
  navListTemplate,
  breadcrumbItemTemplate,
  breadcrumbSeparatorTemplate,
};


