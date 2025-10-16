import { html } from 'da-lit';
import { UI_CLASS as CLASS } from '../constants.js';

export const sectionTemplate = ({ id, title, sectionPath = '' }) => html`
  <div class="${CLASS.section || 'form-ui-section'}" id=${id} data-section-path=${sectionPath}>
    <div class="${CLASS.sectionHeader || 'form-ui-section-header'}">
      <h2 class="${CLASS.sectionTitle || 'form-ui-section-title'}">${title || ''}</h2>
    </div>
  </div>
`;

export default { sectionTemplate };


