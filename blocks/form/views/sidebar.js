import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);

const style = await getStyle(import.meta.url);

/**
 * FormsEditor
 *
 * Standalone web component that loads a page's form data from DA, lets the
 * user pick a JSON Schema, mounts the schema-driven Form UI, and provides
 * actions to save/preview/publish via backend services.
 */
class FormSidebar extends LitElement {
  static properties = {
    schemas: { attribute: false },
    json: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  renderSchemaPicker() {
    if (this.schemas === undefined) return nothing;
    return html`
      <p class="da-sidebar-title">Schema</p>
      <sl-select value="${this.json?.metadata.schemaId}">
        ${Object.keys(this.schemas).map((key) => html`<option value="${key}">${this.schemas[key].title}</option>`)}
      </sl-select>
      <p class="da-sidebar-title">Version</p>
      <sl-select>
        <option>Current</option>
      </sl-select>
      ${this.json === null ? html`<sl-button class="primary outline">Use schema</sl-button>` : nothing}
    `;
  }

  renderNavigation() {
    return html`<p class="da-sidebar-title">Navigate</p>`;
  }

  render() {
    if (!this.schemas) return nothing;

    return html`
      <div class="da-sidebar-section">
        ${this.renderSchemaPicker()}
      </div>
      <div class="da-sidebar-section">
        ${this.renderNavigation()}
      </div>
    `;
  }
}

customElements.define('da-form-sidebar', FormSidebar);
