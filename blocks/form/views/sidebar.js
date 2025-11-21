import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import './components/sidebar/sitebar-item.js';

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
    this._onActivateItemGroup = (e) => {
      const pointer = e?.detail?.pointer;
      if (!pointer) return;
      const target = this.shadowRoot.querySelector(`li[data-key="${pointer}"]`)
        || this.shadowRoot.querySelector(`sidebar-item[pointer="${pointer}"]`);
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };
    window.addEventListener('activate-item-group', this._onActivateItemGroup);
  }

  disconnectedCallback() {
    window.removeEventListener('activate-item-group', this._onActivateItemGroup);
    super.disconnectedCallback();
  }

  update(props) {
    if (props.has('formModel') && this.formModel) {
      this.getNav();
    }
    super.update(props);
  }

  getNav() {
    this._nav = this.formModel.annotated;
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

  /**
   * Determine if the item should be rendered.
   * Do not render primitves or arrays under certain conditions
   * @param {Object} item the form item
   * @returns {Boolean} whether or not something should render
   */
  canRender(item) {
    if (item.schema.properties.items?.type) return false;

    const primitives = ['string', 'boolean', 'number'];
    const isPrim = primitives.some((type) => type === item.schema.properties.type);
    if (isPrim) return false;

    if (Array.isArray(item.data)) return true;

    return false;
  }

  renderList(parent) {
    if (!this.canRender(parent)) return nothing;

    return html`
      <li data-key="${parent.pointer}">
        <sidebar-item
          label="${parent.schema.title}"
          pointer="${parent.pointer}"
        ></sidebar-item>
        ${parent.data
        ? html`<ul>${parent.data.map((item) => this.renderList(item))}</ul>`
        : nothing}
      </li>
    `;
  }

  renderNav() {
    if (!this._nav) return nothing;

    return html`
      <p class="da-sidebar-title">Navigation</p>
      <div class="nav-list">
        <ul>${this.renderList(this._nav)}</ul>
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
