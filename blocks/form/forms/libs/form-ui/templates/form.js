import { html } from 'da-lit';
import { UI_CLASS as CLASS } from '../constants.js';

export const formShellTemplate = ({ title = 'Form' } = {}) => html`
  <div class="${CLASS.container}">
    <div class="${CLASS.header}">
      <div class="${CLASS.titleContainer}">
        <span class="${CLASS.title}">${title}</span>
      </div>
    </div>
    <div class="${CLASS.body}"></div>
    <div class="${CLASS.footer}">
      <div class="${CLASS.validation}"></div>
    </div>
  </div>
`;

export default { formShellTemplate };


