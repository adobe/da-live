import { html, nothing } from 'da-lit';
import { removeButtonTemplate as sharedRemoveButtonTemplate, addButtonTemplate as sharedAddButtonTemplate } from './buttons.js';
import { groupTitleTemplate } from './grouptitle.js';

export const arrayContainerTemplate = ({ fieldPath, items }) => html`
  <div class="form-ui-array-container" data-field=${fieldPath}>
    <div class="form-ui-array-items">${items}</div>
  </div>
`;

export const removeButtonTemplate = (args) => sharedRemoveButtonTemplate(args);

export const arrayItemTemplate = ({ id, title, content, removeButton = nothing }) => html`
  <div class="form-ui-array-item" id=${id}>
    <div class="form-ui-group-content">
      <div class="form-ui-array-item-header">
        ${groupTitleTemplate({ title })}
        <div class="form-ui-array-item-actions">
          ${removeButton}
        </div>
      </div>
      ${content}
    </div>
  </div>
`;

export const arrayAddButtonTemplate = ({ label, path, onClick, onFocus }) => sharedAddButtonTemplate({ label, path, onClick, onFocus });

export default { arrayContainerTemplate, arrayItemTemplate, arrayAddButtonTemplate, removeButtonTemplate };


