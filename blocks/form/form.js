import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import getPathDetails from '../shared/pathDetails.js';

import FormModel from './data/model.js';

// Internal utils
import { schemas as schemasPromise } from './utils/schema.js';
import { loadHtml } from './utils/utils.js';

import '../edit/da-title/da-title.js';

// Internal Web Components
import './views/editor.js';
import './views/sidebar.js';
import './views/preview.js';

// External Web Components
await import(`${getNx()}/public/sl/components.js`);

// Styling
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const style = await getStyle(import.meta.url);

const EL_NAME = 'da-form';

class FormEditor extends LitElement {
  static properties = {
    details: { attribute: false },
    formModel: { state: true },
    _schemas: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.fetchDoc(this.details);
  }

  async fetchDoc() {
    const resultPromise = loadHtml(this.details);

    const [schemas, result] = await Promise.all([schemasPromise, resultPromise]);

    if (schemas) this._schemas = schemas;

    if (!result.html) {
      this.formModel = null;
      return;
    }
    this.formModel = new FormModel(result.html, schemas);
  }

  async generateJsonFromSchema(schema) {
    const { JSONSchemaFaker } = await import('../../deps/da-form/dist/json-faker.js');
    console.log(JSONSchemaFaker);
  }

  handleSelectSchema(e) {
    const schemaId = e.target.value;
    if (!schemaId) return;
    const json = this.generateJsonFromSchema(this._schemas[schemaId]);
    // const html = generateFlatHelixHtmlFromStructuredJson(json);
    // this.formModel = new FormModel(html, this._schemas);
  }

  renderSchemaSelector() {
    return html`
      <p class="da-form-title">Please select a schema to get started</p>
      <sl-select @change=${this.handleSelectSchema}>
        <option value="">Select schema</option>
        ${Object.entries(this._schemas).map(([key, value]) => html`
          <option value="${key}">${value.title}</option>
        `)}
      </sl-select>`;
  }

  renderFormEditor() {
    if (this.formModel === null) {
      if (this._schemas) return this.renderSchemaSelector();

      return html`
        <p class="da-form-title">Please create a schema</p>
        <a href="https://main--da-live--adobe.aem.live/apps/schema?nx=schema#/${this.details.owner}/${this.details.repo}">Schema Editor</a>
      `;
    }

    return html`
      <div class="da-form-editor">
        <da-form-editor .formModel=${this.formModel}></da-form-editor>
        <da-form-preview .formModel=${this.formModel}></da-form-preview>
      </div>`;
  }

  render() {
    return html`
      <div class="da-form-wrapper">
        ${this.formModel !== undefined ? this.renderFormEditor() : nothing}
        <da-form-sidebar .formModel=${this.formModel}></da-form-sidebar>
      </div>
    `;
  }
}

customElements.define(EL_NAME, FormEditor);

function setDetails(parent, name, details) {
  const cmp = document.createElement(name);
  cmp.details = details;
  parent.append(cmp);
}

function setup(el) {
  el.replaceChildren();
  const details = getPathDetails();
  setDetails(el, 'da-title', details);
  setDetails(el, EL_NAME, details);
}

export default function init(el) {
  setup(el);
  window.addEventListener('hashchange', () => { setup(el); });
}
