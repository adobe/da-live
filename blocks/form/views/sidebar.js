import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import './components/sidebar/sitebar-item.js';
import { scrollWithin } from '../utils/scroll-utils.js';
import { ref } from '../../../deps/lit/dist/index.js';
import { EVENT_FOCUS_GROUP, EVENT_SIDEBAR_SCROLL_TO, EVENT_VISIBLE_GROUP } from '../utils/events.js';

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
    this._boundOnActivateItemGroup = this.handleActivateItemGroup.bind(this);
    this._boundOnSidebarScrollTo = this.handleSidebarScrollTo.bind(this);
    this._boundOnVisibleGroup = this.handleVisibleGroup.bind(this);
    this._boundOnScroll = () => this.updateActiveIndicator();
    this._boundOnResize = () => this.updateActiveIndicator();
    this.attachEventListeners();
    this.updateHeaderOffsetVar();
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
    window.addEventListener(EVENT_FOCUS_GROUP, this._boundOnActivateItemGroup);
    window.addEventListener(EVENT_SIDEBAR_SCROLL_TO, this._boundOnSidebarScrollTo);
    window.addEventListener(EVENT_VISIBLE_GROUP, this._boundOnVisibleGroup);
    this.addEventListener('scroll', this._boundOnScroll, { passive: true });
    window.addEventListener('resize', this._boundOnResize);
  }

  detachEventListeners() {
    window.removeEventListener(EVENT_FOCUS_GROUP, this._boundOnActivateItemGroup);
    window.removeEventListener(EVENT_SIDEBAR_SCROLL_TO, this._boundOnSidebarScrollTo);
    window.removeEventListener(EVENT_VISIBLE_GROUP, this._boundOnVisibleGroup);
    this.removeEventListener('scroll', this._boundOnScroll);
    window.removeEventListener('resize', this._boundOnResize);
  }

  handleSidebarScrollTo(e) {
    const pointer = e?.detail?.pointer;
    if (pointer == null) return;
    const target = this._navEls.get(pointer);
    if (target && typeof target.scrollIntoView === 'function') {
      this.updateHeaderOffsetVar();
      scrollWithin(
        this,
        target,
        { behavior: 'smooth', block: 'start' },
        { onlyIfNeeded: true },
      );
    }
  }

  handleVisibleGroup(e) {
    const pointer = e?.detail?.pointer;
    if (pointer == null) return;
    this._visiblePointer = pointer;
    // Update indicator after DOM paints current positions
    requestAnimationFrame(() => this.updateActiveIndicator());
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
      this.updateHeaderOffsetVar();
      scrollWithin(
        this,
        target,
        { behavior: 'smooth', block: 'start' },
        { onlyIfNeeded: true },
      );
    }
  }

  updateHeaderOffsetVar() {
    const header = this.shadowRoot.querySelector('.da-sidebar-header');
    const headerHeight = header?.getBoundingClientRect().height || 0;
    this.style.setProperty('--sidebar-header-height', `${headerHeight + 8}px`);
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
