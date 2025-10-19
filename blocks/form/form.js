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
import './views/editor.js';
import './views/sidebar.js';
import './views/preview.js';

// Styling
const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
const style = await getStyle(import.meta.url);

const EL_NAME = 'da-form';
class FormEditor extends LitElement {
  static properties = {
    details: { attribute: false },
    html: { state: true },
    json: { state: true },
    schemas: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.fetchSchemas(this.details);
    this.fetchDoc(this.details);
  }

  async fetchDoc() {
    const result = await loadHtml(this.details);
    if (!result.html) {
      this.json = null;
      this.html = null;
      return;
    }
    this.html = result.html;
    this.json = await convertHtmlToJson(this.html);
  }

  async fetchSchemas() {
    this.schemas = await schemas;
  }

  renderFormEditor() {
    if (this.json === undefined) return nothing;
    if (this.json === null) return html`<p>Select a schema to get started.</p>`;

    return html`
      <div class="da-form-editor">
        <da-form-editor .json=${this.json} .schemas=${this.schemas}></da-form-editor>
        <da-form-preview .json=${this.json}></da-form-preview>
      </div>`;
  }

  render() {
    return html`
      <div class="da-form-wrapper">
        ${this.json && this.schemas ? this.renderFormEditor() : nothing}
        <da-form-sidebar .json=${this.json} .schemas=${this.schemas}></da-form-sidebar>
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
