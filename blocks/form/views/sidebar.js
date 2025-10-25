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

  renderList(parent) {
    const list = Object.values(parent);

    return html`
      <ul>
        <li>
          <span>${parent.schema?.title || 'Root'}</span>
          <ul>
            ${list.map((item) => {
              if (!item.schema) return nothing;
              if (!(item.schema.type === 'object' || item.schema.type === 'array')) return nothing;
              return html`
                  <li>${item.schema.title}</li>
                  ${item.data.map((subItem) => this.renderList(subItem.data))}
                `;
            })}
          </ul>
        </li>
      </ul>
    `;
  }

  renderNav() {
    if (!this._nav) return nothing;

    return html`
      <p class="da-sidebar-title">Navigation</p>
      <div class="nav-list">
      <ul>
        <li>
          <span>${this.formModel.schema.title}</span>
          <ul>
            ${this.renderList(this._nav.data)}
          </ul>
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
