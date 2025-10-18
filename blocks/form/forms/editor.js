import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

import { loadDoc, loadSchemas } from './utils/loaders.js';
import { convertDoc2Json } from './utils/converters.js';

// import { ServiceContainer } from './libs/services/service-container.js';
// import mountFormUI from './libs/form-ui/form-mount.js';

import 'https://da.live/nx/public/sl/components.js';

import '../views/sidebar.js';


const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);

const style = await getStyle(import.meta.url);
// const formContentStyles = await getStyle('/blocks/form/forms/libs/form-ui/styles/form-ui.content.css');
// const formGroupsStyles = await getStyle('/blocks/form/forms/libs/form-ui/styles/form-ui.groups.css');
// const formInputsStyles = await getStyle('/blocks/form/forms/libs/form-ui/styles/form-ui.inputs.css');
// const formNavigationStyles = await getStyle('/blocks/form/forms/libs/form-ui/styles/form-ui.navigation.css');

/**
 * FormsEditor
 *
 * Standalone web component that loads a page's form data from DA, lets the
 * user pick a JSON Schema, mounts the schema-driven Form UI, and provides
 * actions to save/preview/publish via backend services.
 */
class FormsEditor extends LitElement {
  static properties = {
    doc: { state: true },
    schemas: { state: true },
    // documentData: { type: Object },
    // loading: { type: Boolean },
    // error: { type: String },
    // schemas: { type: Array },
    // selectedSchema: { type: String },
    // loadingSchemas: { type: Boolean },
    // schemaError: { type: String },
    // showSchemaDialog: { type: Boolean },
    // context: { type: Object },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];

    // Fetch the underlying HTML doc
    this.fetchDoc(this.details);

    // Always fetch the schemas
    this.fetchSchemas(this.details);
  }

  async fetchDoc() {
    this.doc = await loadDoc(this.details);
    if (!this.doc) return;
    this.json = convertDoc2Json(this.doc);
  }

  async fetchSchemas() {
    this.schemas = await loadSchemas(this.details);
  }

  renderFormEditor() {
    return nothing;
  }

  renderSchemaPicker() {
    // Do nothing while undefined
    if (this.schemas === undefined) return nothing;
    return html`
      <p class="da-sidebar-title">Schema</p>
      <sl-select>
        ${this.schemas.map((schema) => html`<option>${schema}</option>`)}
      </sl-select>
      <p class="da-sidebar-title">Version</p>
      <sl-select>
        <option>Current</option>
      </sl-select>
    `;
  }

  renderNavigation() {

  }

  renderDataPreview() {
    if (this.json === undefined) return nothing;
    return html`<sl-textarea>${this.json}</sl-textarea>`;
  }

  render() {
    return html`
      <div class="da-form-wrapper">
        <div class="da-form-editor">
          ${this.renderFormEditor()}
          ${this.renderDataPreview()}
        </div>
        <da-form-sidebar .schemas=${this.schemas}></da-form-sidebar>
      </div>
    `;
  }
}

customElements.define('da-forms-editor', FormsEditor);
