import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import './components/sidebar/sitebar-item.js';
import { isVisibleWithin, scrollWithin } from '../utils/scroll-utils.js';
import { ref } from '../../../deps/lit/dist/index.js';

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
    this._navEls = new Map();
    this._boundOnBreadcrumbActivate = this.handleBreadcrumbActivate.bind(this);
    this._boundOnActivateItemGroup = this.handleActivateItemGroup.bind(this);
    this.attachEventListeners();
  }

  disconnectedCallback() {
    this.detachEventListeners();
    super.disconnectedCallback();
  }

  update(props) {
    if (props.has('formModel') && this.formModel) {
      this.getNav();
    }
    super.update(props);
  }

  attachEventListeners() {
    window.addEventListener('breadcrumb-activate', this._boundOnBreadcrumbActivate, { capture: true });
    window.addEventListener('activate-item-group', this._boundOnActivateItemGroup);
  }

  detachEventListeners() {
    window.removeEventListener('breadcrumb-activate', this._boundOnBreadcrumbActivate, { capture: true });
    window.removeEventListener('activate-item-group', this._boundOnActivateItemGroup);
  }

  handleBreadcrumbActivate(e) {
    const pointer = e?.detail?.pointer;
    if (pointer == null) return;
    const target = this._navEls.get(pointer);
    // 1) Sync active state without triggering component scroll handlers
    window.dispatchEvent(new CustomEvent('activate-item-group', {
      detail: { pointer, source: 'sidebar', reason: 'breadcrumb', noScroll: true },
      bubbles: true,
      composed: true,
    }));
    // 2) Start both scrolls in parallel: sidebar (host) and editor
    if (target && typeof target.scrollIntoView === 'function') {
      scrollWithin(this, target, { behavior: 'smooth', block: 'center' }, { onlyIfNeeded: true });
    }
    // Ask editor to perform smooth scroll with header offset
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('editor-scroll-to', {
        detail: { pointer },
        bubbles: true,
        composed: true,
      }));
    });
  }

  handleActivateItemGroup(e) {
    const { pointer, source, noScroll } = e?.detail || {};
    if (pointer == null) return;
    // Do not scroll the sidebar when the event originates from the sidebar itself
    if (source === 'sidebar' || noScroll) return;
    const target = this._navEls.get(pointer);
    if (!target) return;
    // The host (:host) is the scroll container (overflow: auto), so let the
    // browser bring the target into view within the host only.
    if (typeof target.scrollIntoView === 'function') {
      scrollWithin(this, target, { behavior: 'smooth', block: 'center' }, { onlyIfNeeded: true });
    }
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
      <div class="da-sidebar-header"><p>Version</p></div>
      <sl-select disabled>
        <option>Current</option>
      </sl-select>
      ${this.json === null ? html`<sl-button class="primary outline">Use schema</sl-button>` : nothing}`;
  }

  renderSchema() {
    if (!this.schemas) return nothing;
    return html`
      <div class="da-sidebar-header"><p>Schema</p></div>
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
      <li
        data-key="${parent.pointer}"
        ${ref((el) => {
      if (el) {
        this._navEls.set(parent.pointer, el);
      } else {
        this._navEls.delete(parent.pointer);
      }
    })}
      >
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
      <div class="da-sidebar-header"><p>Navigation</p></div>
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
