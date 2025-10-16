import { render } from 'da-lit';
import { UI_CLASS as CLASS } from '../constants.js';
import { pathToGroupId } from '../form-generator/path-utils.js';
import { groupTemplate } from '../templates/group.js';

/**
 * group-renderer
 * Creates group containers (header + content) and supports rendering primitives
 * and array-of-objects sections. Returns elements; caller appends to DOM.
 */
export function renderGroupContainer({
  container,
  title,
  breadcrumbPath = [],
  schemaPath = [],
  addHeader = true,
}) {
  const groupPath = schemaPath.length > 0 ? schemaPath.join('.') : 'root';
  const groupId = pathToGroupId(groupPath);
  const mount = document.createElement('div');
  render(groupTemplate({ id: groupId, breadcrumbPath, schemaPath, title, addHeader, content: '' }), mount);
  const groupContainer = mount.firstElementChild;
  container.appendChild(groupContainer);
  const contentEl = groupContainer.querySelector(`.${CLASS.groupContent}`);
  return { groupId, element: groupContainer, contentEl };
}

export function renderPrimitivesIntoGroup({
  contentEl,
  properties,
  required = [],
  pathPrefix = '',
  generateObjectFields,
}) {
  if (!contentEl || !generateObjectFields || !properties) return;
  generateObjectFields(contentEl, properties, required, pathPrefix);
}

/**
 * Render an array-of-objects group section (header + array UI from generateInput)
 */
export function renderArrayGroup({
  container,
  title,
  breadcrumbPath,
  schemaPath,
  generateInput,
}) {
  const { element, contentEl, groupId } = renderGroupContainer({
    container,
    title,
    breadcrumbPath,
    schemaPath,
    addHeader: true,
  });
  const pathPrefix = schemaPath.join('.');
  const arrayUI = generateInput(pathPrefix, { type: 'array' });
  if (arrayUI) contentEl.appendChild(arrayUI);
  element.dataset.fieldPath = pathPrefix;
  return { groupId, element, contentEl };
}

export default { renderGroupContainer, renderPrimitivesIntoGroup, renderArrayGroup };

