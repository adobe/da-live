import { html } from 'da-lit';

export const errorTemplate = ({ message = 'An error occurred.' } = {}) => html`
  <div class="da-dialog-asset-error">
    <p>${message}</p>
    <div class="da-dialog-asset-buttons">
      <button class="back">Back</button>
      <button class="cancel">Cancel</button>
    </div>
  </div>
`;

export default { errorTemplate };


