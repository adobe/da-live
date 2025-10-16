import { html } from 'da-lit';
import { ICONS } from '../utils/icon-urls.js';

export const addButtonTemplate = ({ label = 'Add', path = '', onClick, onFocus }) => html`
  <button type="button" class="form-content-add" data-path=${path} @click=${onClick} @focus=${onFocus}>
    <img class="form-ui-icon" src=${ICONS.plus} alt="" aria-hidden="true" /> <span>${label}</span>
  </button>
`;

export const removeButtonTemplate = ({ confirm = false, onClick }) => html`
  <button
    type="button"
    class="form-ui-remove ${confirm ? 'confirm-state' : ''}"
    title=${confirm ? 'Click to confirm removal' : 'Remove item'}
    @click=${onClick}
  >
    ${confirm ? html`✓` : html`<img class="form-ui-icon" src=${ICONS.trash} alt="" aria-hidden="true" />`}
  </button>
`;

export default { addButtonTemplate, removeButtonTemplate };


