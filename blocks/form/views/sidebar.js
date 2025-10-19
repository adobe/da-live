import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import renderJson from './nav.js';

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
    _schema: { state: true },
    _nav: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  update(props) {
    if (props.has('json') || props.has('schemas')) {
      if (this.json && this.schemas) {
        this.getNav();
        this.getSchema();
      }
    }
    super.update(props);
  }

  async getSchema() {
    if (this.emptySchemas) return;
    this._schema = this.schemas[this.json?.metadata.schemaId];
  }

  async getNav() {
    if (this.emptySchemas) return;
    this._nav = await renderJson(this.json);
  }

  get emptySchemas() {
    return !Object.keys(this.schemas).length;
  }

  renderNoSchemas() {
    return html`
      <p>This project has no schemas.</p>
      <p><a href="https://docs.da.live/administrators/forms">Read documentation</a></p>
    `;
  }

  renderSchemaSelector() {
    return html`
      <sl-select value="${this._schema?.id || nothing}">
        ${Object.keys(this.schemas).map((key) => html`
          <option value="${key}">${this.schemas[key].title}</option>
        `)}
      </sl-select>
      <p class="da-sidebar-title">Version</p>
      <sl-select>
        <option>Current</option>
      </sl-select>
      ${this.json === null ? html`<sl-button class="primary outline">Use schema</sl-button>` : nothing}`;
  }

  renderSchema() {
    if (!this.schemas) return nothing;
    return html`
      <p class="da-sidebar-title">Schema</p>
      ${this.emptySchemas
        ? this.renderNoSchemas()
        : this.renderSchemaSelector()}
    `;
  }

  renderNav() {
    if (!this._nav) return nothing;
    return html`
      <p class="da-sidebar-title">Navigation</p>
      <div class="nav-list">${this._nav}</div>
    `;
  }

  render() {
    if (!this.schemas) return nothing;

    return html`
      <div class="da-sidebar-section">
        ${this.renderSchema()}
      </div>
      <div class="da-sidebar-section">
        ${this.renderNav()}
      </div>
    `;
  }
}

customElements.define('da-form-sidebar', FormSidebar);
