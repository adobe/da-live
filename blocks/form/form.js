import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import getPathDetails from '../shared/pathDetails.js';

// Internal utils
import { schemas } from './utils/schema.js';
import { loadHtml, convertHtmlToJson } from './utils/utils.js';

// External Web Components
import 'https://da.live/nx/public/sl/components.js';
import '../edit/da-title/da-title.js';

// Internal Web Components
import './views/sidebar.js';
import './views/preview.js';

// Styling
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const style = await getStyle(import.meta.url);

class FormEditor extends LitElement {
  static properties = {
    html: { state: true },
    json: { state: true },
    schemas: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];

    // Always fetch the schemas
    this.fetchSchemas(this.details);

    // Fetch the underlying HTML doc
    this.fetchDoc(this.details);
  }

  async fetchDoc() {
    const result = await loadHtml(this.details);
    if (!result.html) {
      this.json = null;
      return;
    }
    this.html = result.html;
    this.json = await convertHtmlToJson(this.html);
  }

  async fetchSchemas() {
    this.schemas = await schemas;
  }

  renderFormEditor() {
    if (this.json === null) return html`<p>Select a schema to get started.</p>`;
    return nothing;
  }

  render() {
    return html`
      <div class="da-form-wrapper">
        <div class="da-form-editor">
          ${this.renderFormEditor()}
          <da-form-preview .json=${this.json}></da-form-preview>
        </div>
        <da-form-sidebar .json=${this.json} .schemas=${this.schemas}></da-form-sidebar>
      </div>
    `;
  }
}

customElements.define('da-form-editor', FormEditor);

export default async function init(el) {
  const details = getPathDetails();

  const title = document.createElement('da-title');
  title.details = details;

  const form = document.createElement('da-form-editor');
  form.details = details;

  el.replaceChildren();
  el.append(title, form);
}
