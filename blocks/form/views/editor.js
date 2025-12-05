import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import './components/editor/generic-field/generic-field.js';
import './components/editor/form-item-group/form-item-group.js';
import './components/navigation/breadcrumb-nav/breadcrumb-nav.js';
import { ref, createRef } from '../../../deps/lit/dist/index.js';
import {
  EVENT_EDITOR_SCROLL_TO,
  EVENT_FOCUS_ELEMENT,
  LAYOUT,
  SCROLL,
} from '../constants.js';
import ElementRegistryController from '../controllers/element-registry-controller.js';
import VisibleGroupController from '../controllers/visible-group-controller.js';
import ScrollTargetController from '../controllers/scroll-target-controller.js';
import ActiveStateController from '../controllers/active-state-controller.js';

// Import utilities
import * as fieldHelper from '../utils/field-helper.js';
import * as validationHelper from '../utils/validation-helper.js';
import * as navigationHelper from '../utils/navigation-helper.js';
import * as breadcrumbHelper from '../utils/breadcrumb-helper.js';
import * as focusHelper from '../utils/focus-helper.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);

const style = await getStyle(import.meta.url);

// ============================================
// HELPER FUNCTIONS
// ============================================

function getHeaderOffsetPx(headerElement) {
  const headerHeight = headerElement?.getBoundingClientRect().height || 0;
  return headerHeight + LAYOUT.HEADER_OFFSET_PADDING;
}

/**
 * FormEditor - Main orchestrator component for the form editing UI.
 */
class FormEditor extends LitElement {
  static properties = {
    formModel: { attribute: false },
    validationState: { attribute: false },
    _data: { state: true },
  };

  // ============================================
  // INITIALIZATION
  // ============================================

  constructor() {
    super();
    this._headerRef = createRef();

    // Unified element registry
    this._registry = new ElementRegistryController(this);

    // Active pointer tracking
    this._activeState = new ActiveStateController(this, {
      getDefaultPointer: () => this._data?.pointer ?? '',
      isPointerValid: (pointer) => {
        if (!this._data) return false;
        return this._data.pointer === pointer
          || pointer.startsWith(this._data.pointer === '' ? '/' : `${this._data.pointer}/`);
      },
    });

    // Scroll-to functionality
    this._scrollTarget = new ScrollTargetController(this, {
      scrollEvent: EVENT_EDITOR_SCROLL_TO,
      getTarget: (pointer) => this._registry.get(pointer),
      getHeaderOffset: () => getHeaderOffsetPx(this._headerRef.value),
      scrollBehavior: SCROLL.BEHAVIOR,
    });

    // Visible group detection
    this._visibleGroups = new VisibleGroupController(this, {
      getGroupId: (el) => el?.getAttribute?.('pointer'),
      getMeasureTarget: (el) => el?.shadowRoot?.firstElementChild || el,
      topOffsetPx: 0,
    });

    this.validationState = null;
    this._fieldPropsMap = new Map();

    // Bind event handlers
    this._handleTargetFieldFocus = this._handleTargetFieldFocus.bind(this);
    this._handleFieldValueChange = this._handleFieldValueChange.bind(this);
    this._handleBreadcrumbNavigation = this._handleBreadcrumbNavigation.bind(this);
    this._handleSectionNavigation = this._handleSectionNavigation.bind(this);
    this._handleFieldClick = this._handleFieldClick.bind(this);
  }

  // ============================================
  // LIFECYCLE HOOKS
  // ============================================

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    window.addEventListener(EVENT_FOCUS_ELEMENT, this._handleTargetFieldFocus);
    this.addEventListener('field-click', this._handleFieldClick);
  }

  disconnectedCallback() {
    if (this._headerResizeObserver) {
      this._headerResizeObserver.disconnect();
      this._headerResizeObserver = null;
    }
    window.removeEventListener(EVENT_FOCUS_ELEMENT, this._handleTargetFieldFocus);
    this.removeEventListener('field-click', this._handleFieldClick);
    super.disconnectedCallback();
  }

  firstUpdated() {
    this.updateHeaderOffsetVar();
    this.observeHeaderResize();
  }

  willUpdate(changedProps) {
    if (changedProps.has('formModel') && this.formModel) {
      this._data = this.formModel.root;
    }

    // Cache computed props for all fields when model or validation changes
    if (changedProps.has('formModel') || changedProps.has('validationState')) {
      this._buildFieldPropsCache();
    }
  }

  // ============================================
  // PROP CACHING (Performance)
  // ============================================

  _buildFieldPropsCache() {
    this._fieldPropsMap.clear();

    if (!this.formModel) return;

    this.formModel.getFields().forEach((field) => {
      this._fieldPropsMap.set(field.pointer, {
        type: fieldHelper.determineFieldType(field.schema),
        label: `${field.schema.title}${field.required ? ' *' : ''}`,
        error: validationHelper.getFieldError(field.pointer, this.validationState),
        required: field.required,
        options: fieldHelper.getEnumOptions(field.schema),
      });
    });
  }

  // ============================================
  // HEADER MANAGEMENT (DOM Orchestration)
  // ============================================

  updateHeaderOffsetVar() {
    const offset = getHeaderOffsetPx(this._headerRef.value);
    this.style.setProperty('--editor-header-height', `${offset}px`);
    this._visibleGroups?.setTopOffsetPx(offset);
  }

  observeHeaderResize() {
    const header = this._headerRef.value;
    if (!header || typeof ResizeObserver === 'undefined') return;

    this._headerResizeObserver = new ResizeObserver(() => {
      this.updateHeaderOffsetVar();
    });
    this._headerResizeObserver.observe(header);
  }

  // ============================================
  // STATE ACCESSORS
  // ============================================

  get activePointer() {
    return this._activeState.pointer;
  }

  get visiblePointer() {
    return this._visibleGroups?.visiblePointer;
  }

  // ============================================
  // ELEMENT REGISTRATION (Lit ref integration)
  // ============================================

  registerElement = (pointer, el) => {
    if (el) {
      this._registry.register(pointer, el);
    } else {
      this._registry.unregister(pointer);
    }
  };

  createGroupRef(pointer) {
    let groupElement = null;
    return ref((el) => {
      this.registerElement(pointer, el);

      if (el) {
        groupElement = el;
        this._visibleGroups?.registerGroup(el);
      } else if (groupElement) {
        this._visibleGroups?.unregisterGroup(groupElement);
        groupElement = null;
      }
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  _handleTargetFieldFocus(e) {
    const targetPointer = e.detail?.targetFieldPointer;
    if (targetPointer == null) return;

    // Focus without scrolling - ScrollTargetController handles scroll with SCROLL.BEHAVIOR
    focusHelper.focusElement(targetPointer, this._registry, { preventScroll: true });
  }

  _handleFieldValueChange(e) {
    this.dispatchEvent(new CustomEvent('form-model-intent', {
      detail: { op: 'replace', path: e.detail.id, value: e.detail.value },
      bubbles: true,
      composed: true,
    }));
  }

  _handleBreadcrumbNavigation(e) {
    navigationHelper.navigateToPointer(e.detail.id, { source: 'breadcrumb' });
  }

  _handleSectionNavigation(e) {
    navigationHelper.navigateToPointer(e.detail.id, { source: 'editor' });
  }

  _handleFieldClick(e) {
    // When a field is clicked, navigate to its parent group to highlight it
    const fieldPointer = e.detail.id;
    const parentPointer = this._getParentPointer(fieldPointer);

    if (parentPointer != null) {
      navigationHelper.navigateToPointer(parentPointer, { source: 'editor' });
    }
  }

  /**
   * Get parent pointer from a child pointer.
   * @param {string} pointer - Child pointer (e.g., '/group/field')
   * @returns {string|null} - Parent pointer (e.g., '/group') or null
   * @private
   */
  _getParentPointer(pointer) {
    if (!pointer || pointer === '') return null;
    const lastSlash = pointer.lastIndexOf('/');
    if (lastSlash === -1) return ''; // Root
    return pointer.substring(0, lastSlash);
  }

  // ============================================
  // RENDERING
  // ============================================

  render() {
    if (!this._data) return nothing;

    const breadcrumbPointer = (this.visiblePointer ?? this.activePointer ?? this._data.pointer);
    const segments = breadcrumbHelper.buildBreadcrumbSegments(
      this._data,
      breadcrumbPointer,
      this.formModel,
    );

    return html`
      <div class="form-header" ${ref(this._headerRef)}>
        <h2>${this._data.schema.title}</h2>
        <breadcrumb-nav 
          .segments=${segments}
          @segment-click=${this._handleBreadcrumbNavigation}
        ></breadcrumb-nav>
      </div>
      <form>
        <div>
          ${this._renderItem(this._data)}
        </div>
      </form>
      `;
  }

  _renderItem(item) {
    if (item.schema.properties.items?.type) return nothing;

    const children = this.formModel?.getChildren(item.pointer) || [];
    const isGroup = children.length > 0;

    if (!isGroup) return this._renderField(item);
    return this._renderGroup(item);
  }

  _renderField(item) {
    const props = this._fieldPropsMap.get(item.pointer);
    if (!props) return nothing;

    return html`
      <generic-field
        id=${item.pointer}
        type=${props.type}
        label=${props.label}
        value=${item.data}
        error=${props.error}
        required=${props.required}
        .options=${props.options}
        .onRef=${this.registerElement}
        @value-change=${this._handleFieldValueChange}
      ></generic-field>
    `;
  }

  _renderGroup(item) {
    const children = this.formModel?.getChildren(item.pointer) || [];
    const errorCount = validationHelper.getGroupErrorCount(
      item.pointer,
      this.validationState,
    );

    return html`
      <form-item-group
        class="item-group"
        data-key="${item.pointer}"
        id="${item.pointer}"
        pointer="${item.pointer}"
        label="${item.schema.title}"
        badge=${errorCount}
        ?active=${item.pointer === this.activePointer}
        ${this.createGroupRef(item.pointer)}
        @section-click=${this._handleSectionNavigation}
      >
        ${children.map((child) => this._renderItem(child))}
      </form-item-group>
    `;
  }
}

customElements.define('da-form-editor', FormEditor);
