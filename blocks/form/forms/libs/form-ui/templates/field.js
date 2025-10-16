import { html, nothing } from 'da-lit';
import { UI_CLASS as CLASS } from '../constants.js';
import { actionsContainerTemplate } from './actions.js';

/**
 * fieldTemplate
 * Template for primitive field row with label, body (input + actions), description.
 * inputNode can be a DOM node produced by InputFactory; lit will insert it.
 */
export const fieldTemplate = ({ key, fullPath, label, isRequired = false, inputNode = null, isArrayContainer = false, description = '' }) => {
  return html`
    <div class="${CLASS.field}" data-field=${key} data-field-path=${fullPath}>
      <label class="${CLASS.label} ${isRequired ? 'required' : ''}">${label}${isRequired ? ' *' : ''}</label>
      ${inputNode ? (
        isArrayContainer ? html`${inputNode}` : html`
          <div class="form-ui-field-row">
            <div class="form-ui-field-main">${inputNode}</div>
            ${actionsContainerTemplate({ forPath: fullPath })}
          </div>
        `
      ) : nothing}
      ${description ? html`<div class="${CLASS.description}">${description}</div>` : nothing}
    </div>
  `;
};

export default { fieldTemplate };


