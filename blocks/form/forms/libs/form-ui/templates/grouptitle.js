import { html } from 'da-lit';
import { UI_CLASS as CLASS } from '../constants.js';

export const groupTitleTemplate = ({ title = '' } = {}) => html`
  <div class="group-title">
    <h1>${title}</h1>
  </div>
`;

export default { groupTitleTemplate };



