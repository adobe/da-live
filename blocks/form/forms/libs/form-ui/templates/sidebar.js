import { html } from 'da-lit';
import ICONS from '../utils/icon-urls.js';

export const sidebarTemplate = () => html`
  <div class="form-side-panel">
    <div class="form-side-panel-main">
      <div class="form-side-panel-header">
        <div class="form-side-panel-title-container">
          <span class="form-side-panel-title">Navigation</span>
          
        </div>
        <div class="form-side-panel-controls">
            <label class="nav-activatable-toggle-label" title="Hide optional groups" aria-label="Hide optional groups">
              <input type="checkbox" class="nav-activatable-toggle" />
              <span class="toggle-slider" aria-hidden="true"></span>
            </label>
            <button type="button" class="form-side-panel-search" title="Open search (Ctrl/Cmd+K)" aria-label="Open search">
              <img class="form-ui-icon" src=${ICONS.search} alt="" aria-hidden="true" width="16" height="16" />
            </button>
          </div>
      </div>
      <div class="form-side-panel-content">
        <div class="form-navigation-tree">
          <div class="form-nav-active-indicator"></div>
        </div>
      </div>
    </div>
  </div>
`;

export default { sidebarTemplate };


