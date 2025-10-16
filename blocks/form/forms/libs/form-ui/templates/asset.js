import { html } from 'da-lit';
import { ICONS } from '../utils/icon-urls.js';

export const assetPreviewTemplate = ({ src, name, fileIconUrl, isImage }) => html`
  <div class="form-ui-preview-box">
    <div class="form-ui-preview-item">
      <div class="form-ui-preview-media">
        ${isImage ? html`<img alt=${name || 'Image preview'} src=${src} />` : html`
          <div class="form-ui-preview-media-icon">
            <img src=${fileIconUrl} alt=${name || 'File'} />
          </div>
        `}
      </div>
      <div class="form-ui-preview-info">
        <div class="form-ui-preview-header">
          <p class="form-ui-preview-title">${name || ''}</p>
        </div>
      </div>
    </div>
  </div>
`;

export const assetPickerWrapperTemplate = ({ ariaLabel = 'Choose a file from Assets', labelText = 'Choose a file from Assets' }) => html`
  <div class="form-ui-picker" tabindex="0" role="button" aria-label=${ariaLabel}>
    <div class="form-ui-description">
      <img class="form-ui-icon" src=${ICONS.replace} alt="" aria-hidden="true" /> <span class="form-ui-picker-label-text">${labelText}</span>
    </div>
  </div>
`;

export const replaceButtonTemplate = ({ onClick }) => html`
  <button type="button" class="form-ui-action form-ui-replace-action" title="Replace" @click=${onClick}>
    <img class="form-ui-icon" src=${ICONS.replace} alt="" aria-hidden="true" />
  </button>
`;

export default { assetPreviewTemplate, replaceButtonTemplate, assetPickerWrapperTemplate };


