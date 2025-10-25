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
    formModel: { attribute: false },
    _schemas: { attribute: false },
    _nav: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  update(props) {
    if (props.has('formModel') && this.formModel) {
      this.getNav();
    }
    super.update(props);
  }

  getNav() {
    this._nav = this.formModel.jsonWithSchema;
    console.log(this._nav);
  }

  renderNoSchemas() {
    return html`
      <p>This project has no schemas.</p>
      <p><a href="https://main--da-live--adobe.aem.live/apps/schema?nx=schema">Create one</a></p>
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
      <sl-select disabled>
        <option>Current</option>
      </sl-select>
      ${this.json === null ? html`<sl-button class="primary outline">Use schema</sl-button>` : nothing}`;
  }

  renderSchema() {
    if (!this.schemas) return nothing;
    return html`
      <p class="da-sidebar-title">Schema</p>
    `;
  }

  renderPrimitive(item) {
    if (!['string', 'boolean', 'number'].some((type) => type === item.schema.type)) return null;
    return html`<li data-key="${item.key}"><span>${item.schema.title || item.key}</span></li>`;
  }

  renderList(parent) {
    const prim = this.renderPrimitive(parent);
    if (prim) return prim;

    return parent.data.map((item) => {
      if (!item.schema) return nothing;

      const primitive = this.renderPrimitive(item);
      if (primitive) return primitive;

      return html`
        <li data-key="${item.key}">
          <span class="sub-item">${item.title || item.key}</span>
          ${item.data.map((subItem) => html`<ul>${this.renderList(subItem)}</ul>`)}
        </li>`;
    });
  }

  renderNav() {
    if (!this._nav) return nothing;

    return html`
      <p class="da-sidebar-title">Navigation</p>
      <div class="nav-list">
        <ul>
          <li>
            <span>${this.formModel.schema.title}</span>
            <ul>${this.renderList(this._nav)}</ul>
          </li>
        </ul>
      </div>
    `;
  }

  render() {
    if (!this.formModel) return nothing;

    return html`
      <div class="da-sidebar-section">
        ${this.renderNav()}
      </div>
    `;
  }
}

customElements.define('da-form-sidebar', FormSidebar);
