import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import './components/sidebar/sitebar-item.js';
import { ref } from '../../../deps/lit/dist/index.js';
import { EVENT_SIDEBAR_SCROLL_TO, EVENT_VISIBLE_GROUP } from '../utils/events.js';
import ScrollTargetController from '../controllers/scroll-target-controller.js';

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

  constructor() {
    super();

    // Controller: Handle scroll-to commands
    this._scrollTarget = new ScrollTargetController(this, {
      scrollEvent: EVENT_SIDEBAR_SCROLL_TO,
      getScrollContainer: () => this,
      getHeaderOffset: () => {
        const header = this.shadowRoot?.querySelector('.da-sidebar-header');
        return (header?.getBoundingClientRect().height || 0) + 8;
      },
      useInternalScroll: true,
      onlyIfNeeded: true,
    });
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._navEls = new Map();

    // Listen for visible group changes
    this.getRootNode().host?.addEventListener(EVENT_VISIBLE_GROUP, (e) => {
      this._visiblePointer = e.detail?.pointer;
      requestAnimationFrame(() => this.updateActiveIndicator());
    });

    this.addEventListener('scroll', () => this.updateActiveIndicator(), { passive: true });
    window.addEventListener('resize', () => this.updateActiveIndicator());
  }

  disconnectedCallback() {
    window.removeEventListener('resize', () => this.updateActiveIndicator());
    super.disconnectedCallback();
  }

  update(props) {
    if (props.has('formModel') && this.formModel) {
      this._nav = this.formModel.annotated;
    }
    super.update(props);
  }

  updateActiveIndicator() {
    // Allow empty string ("") as a valid root pointer; only guard null/undefined
    if (this._visiblePointer == null || !this._navListEl || !this._indicatorEl) return;
    const target = this._navEls.get(this._visiblePointer);
    if (!target) {
      this._indicatorEl.style.height = '0px';
      return;
    }
    const containerRect = this._navListEl.getBoundingClientRect();
    // Measure only the label row, not the entire LI (which includes children)
    const labelEl = target.querySelector('sidebar-item') || target;
    const labelRect = labelEl.getBoundingClientRect();
    const top = Math.max(0, labelRect.top - containerRect.top - 5);
    // Ensure the bar is at least the full row height
    const containerLineHeight = parseFloat(getComputedStyle(this._navListEl).lineHeight);
    const fallbackLine = Number.isFinite(containerLineHeight) ? containerLineHeight : 25;
    const height = Math.max(0, Math.max(labelRect.height, fallbackLine));
    this._indicatorEl.style.top = `${Math.round(top)}px`;
    this._indicatorEl.style.height = `${Math.round(height)}px`;
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
        this._scrollTarget?.registerTarget(parent.pointer, el);
      } else {
        this._navEls.delete(parent.pointer);
        this._scrollTarget?.unregisterTarget(parent.pointer);
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
      <div class="nav-list" ${ref((el) => { this._navListEl = el; })}>
        <div class="form-nav-active-indicator" ${ref((el) => { this._indicatorEl = el; })}></div>
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
