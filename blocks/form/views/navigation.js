import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import './components/navigation/navigation-item/navigation-item.js';
import './components/navigation/navigation-header/navigation-header.js';
import './components/shared/error-badge/error-badge.js';
import { ref, createRef, repeat } from '../../../deps/lit/dist/index.js';
import {
  EVENT_NAVIGATION_SCROLL_TO,
  EVENT_VISIBLE_GROUP,
  EVENT_FOCUS_ELEMENT,
  TIMING,
  SCROLL,
} from '../constants.js';
import ElementRegistryController from '../controllers/element-registry-controller.js';
import ScrollTargetController from '../controllers/scroll-target-controller.js';
import ActiveIndicatorController from '../controllers/active-indicator-controller.js';

// Import utilities
import * as navigationHelper from '../utils/navigation-helper.js';
import * as treeBuilder from '../utils/navigation-tree-builder.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);

const style = await getStyle(import.meta.url);

// ============================================
// HELPER FUNCTIONS
// ============================================

function createDebouncedHandler(callback, delay) {
  let timer = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(callback, delay);
  };
}

/**
 * FormNavigation - Navigation panel with hierarchical form structure and validation badges.
 */
class FormNavigation extends LitElement {
  static properties = {
    formModel: { attribute: false },
    validationState: { attribute: false },
    _nav: { state: true },
    _navTree: { state: true },
    _activePointer: { state: true },
  };

  // ============================================
  // INITIALIZATION
  // ============================================

  constructor() {
    super();
    this._headerRef = createRef();
    this._resizeTimer = null;
    this._navTree = [];
    this._currentVisiblePointer = null;
    this._activePointer = null;

    // Unified element registry for nav items
    this._registry = new ElementRegistryController(this);

    // Controller: Handle scroll-to commands
    this._scrollTarget = new ScrollTargetController(this, {
      scrollEvent: EVENT_NAVIGATION_SCROLL_TO,
      getTarget: (pointer) => this._registry.get(pointer),
      getScrollContainer: () => this,
      getHeaderOffset: () => {
        const header = this._headerRef.value;
        return (header?.getBoundingClientRect().height || 0) + 8;
      },
      useInternalScroll: true,
      onlyIfNeeded: true,
      scrollBehavior: SCROLL.BEHAVIOR,
    });

    // Controller: Manage active indicator positioning
    this._indicatorController = new ActiveIndicatorController(this, {
      getIndicator: () => this._indicatorEl,
      getList: () => this._navListEl,
      getRegistry: () => this._registry,
    });

    // Bind event handlers
    this._onHeaderBadgeClick = this._handleHeaderBadgeClick.bind(this);
    this._handleBadgeClick = this._handleBadgeClick.bind(this);
    this._handleFocusElement = this._handleFocusElement.bind(this);
    this._handleVisibleGroup = this._handleVisibleGroup.bind(this);
    this._debouncedResize = createDebouncedHandler(
      () => this._indicatorController?.updatePosition(this._currentVisiblePointer),
      TIMING.DEBOUNCE_DELAY,
    );
  }

  // ============================================
  // LIFECYCLE HOOKS
  // ============================================

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];

    // Listen for header badge clicks
    this.addEventListener('header-badge-click', this._onHeaderBadgeClick);

    // Listen for visible group changes to update active indicator
    this.getRootNode().host?.addEventListener(EVENT_VISIBLE_GROUP, this._handleVisibleGroup);

    // Listen for focus element changes to track active pointer
    window.addEventListener(EVENT_FOCUS_ELEMENT, this._handleFocusElement);

    this.addEventListener('scroll', () => this._indicatorController?.updatePosition(this._currentVisiblePointer), { passive: true });
    window.addEventListener('resize', this._debouncedResize);
  }

  disconnectedCallback() {
    this.removeEventListener('header-badge-click', this._onHeaderBadgeClick);
    this.getRootNode().host?.removeEventListener(EVENT_VISIBLE_GROUP, this._handleVisibleGroup);
    window.removeEventListener(EVENT_FOCUS_ELEMENT, this._handleFocusElement);
    window.removeEventListener('resize', this._debouncedResize);
    if (this._resizeTimer) {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = null;
    }
    super.disconnectedCallback();
  }

  willUpdate(changedProps) {
    if (changedProps.has('formModel') && this.formModel) {
      this._nav = this.formModel.root;
    }

    // Build navigation tree with badges when model or validation changes
    if (changedProps.has('formModel') || changedProps.has('validationState')) {
      this._navTree = treeBuilder.buildNavigationTree(
        this.formModel,
        this.validationState,
      );
    }
  }

  updated(changedProps) {
    super.updated(changedProps);

    // Update indicator position after nav tree is rendered
    if (changedProps.has('_navTree')) {
      // If no current visible pointer, default to root
      if (!this._currentVisiblePointer && this._nav?.pointer != null) {
        this._currentVisiblePointer = this._nav.pointer;
      }

      requestAnimationFrame(() => {
        this._indicatorController?.updatePosition(this._currentVisiblePointer);
      });
    }
  }

  // ============================================
  // ELEMENT REGISTRATION
  // ============================================

  createNavItemRef(pointer) {
    return ref((el) => {
      if (el) {
        this._registry.register(pointer, el);
      } else {
        this._registry.unregister(pointer);
      }
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  _handleHeaderBadgeClick(e) {
    e?.stopPropagation();
    const firstError = this.validationState?.firstFieldPointer;
    if (firstError) {
      navigationHelper.navigateToField(
        firstError,
        this.formModel,
        { source: 'navigation', reason: 'header-badge' },
      );
    }
  }

  _handleBadgeClick(e) {
    e?.stopPropagation();
    // Get pointer from the badge's parent li element
    const badge = e.target;
    const li = badge.closest('li');
    const pointer = li?.getAttribute('data-key');
    if (!pointer) return;

    navigationHelper.navigateToFirstError(
      pointer,
      this.formModel,
      this.validationState,
      { source: 'navigation', reason: 'validation-badge' },
    );
  }

  _handleFocusElement(e) {
    const { pointer } = e.detail || {};
    if (pointer !== this._activePointer) {
      this._activePointer = pointer;
    }
  }

  _handleVisibleGroup(e) {
    this._currentVisiblePointer = e.detail?.pointer;
    requestAnimationFrame(() => this._indicatorController?.updatePosition(e.detail?.pointer));
  }

  // ============================================
  // RENDERING
  // ============================================

  renderNavHeader() {
    const totalErrors = this.validationState?.totalErrors ?? 0;
    return html`
      <navigation-header
        .totalErrors=${totalErrors}
        ${ref(this._headerRef)}
      ></navigation-header>
    `;
  }

  renderNavItem(item) {
    return html`
      <li data-key="${item.id}" ${this.createNavItemRef(item.id)}>
        <div class="nav-row">
          <navigation-item
            label="${item.label}"
            pointer="${item.id}"
            ?active=${item.id === this._activePointer}
            ?visible=${item.id === this._currentVisiblePointer}
          ></navigation-item>
          ${item.badge > 0 ? html`
            <div class="nav-badges">
              <error-badge
                .count=${item.badge}
                label="Jump to first error in ${item.label} (${item.badge} issues)"
                @error-badge-click=${(e) => this._handleBadgeClick(e)}
              ></error-badge>
            </div>
          ` : nothing}
        </div>
        ${item.children?.length > 0 ? html`
          <ul>${repeat(
      item.children,
      (child) => child.id,
      (child) => this.renderNavItem(child),
    )}</ul>
        ` : nothing}
      </li>
    `;
  }

  renderNav() {
    if (!this._nav) return nothing;

    return html`
      ${this.renderNavHeader()}
      <div class="nav-list" ${ref((el) => { this._navListEl = el; })}>
        <div class="form-nav-active-indicator" ${ref((el) => { this._indicatorEl = el; })}></div>
        <ul>${this.renderRootItem(this._nav)}</ul>
      </div>
    `;
  }

  renderRootItem(root) {
    const errorCount = this.validationState?.groupCounts?.get(root.pointer ?? '') ?? 0;

    return html`
      <li data-key="${root.pointer}" ${this.createNavItemRef(root.pointer)}>
        <div class="nav-row">
          <navigation-item
            label="${root.schema.title}"
            pointer="${root.pointer}"
            ?active=${root.pointer === this._activePointer}
            ?visible=${root.pointer === this._currentVisiblePointer}
          ></navigation-item>
          ${errorCount > 0 ? html`
            <div class="nav-badges">
              <error-badge
                .count=${errorCount}
                label="Jump to first error in ${root.schema.title} (${errorCount} issues)"
                @error-badge-click=${(e) => this._handleBadgeClick(e)}
              ></error-badge>
            </div>
          ` : nothing}
        </div>
        ${this._navTree?.length > 0 ? html`
          <ul>${repeat(
      this._navTree,
      (item) => item.id,
      (item) => this.renderNavItem(item),
    )}</ul>
        ` : nothing}
      </li>
    `;
  }

  render() {
    if (!this.formModel) return nothing;

    return html`
      <div class="da-navigation-section">
        ${this.renderNav()}
      </div>
    `;
  }
}

customElements.define('da-form-navigation', FormNavigation);
