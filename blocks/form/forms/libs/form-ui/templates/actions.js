import { html, nothing } from 'da-lit';

/**
 * actionsContainerTemplate
 * Standard wrapper for field-level actions. Allows slotting content consistently.
 */
export const actionsContainerTemplate = ({ forPath = '', content = nothing } = {}) => html`
  <div class="form-ui-field-actions" data-actions-for=${forPath}>${content}</div>
`;

export default { actionsContainerTemplate };


