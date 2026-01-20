import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import './components/navigation/navigation-item/navigation-item.js';
import './components/navigation/navigation-header/navigation-header.js';
import './components/shared/error-badge/error-badge.js';
import './components/shared/action-menu/action-menu.js';
import './components/shared/insert-button/insert-button.js';
import './components/shared/remove-button/remove-button.js';
import './components/shared/move-to-position-button/move-to-position-button.js';
import { ref, createRef } from '../../../deps/lit/dist/index.js';
import {
  EVENT_NAVIGATION_SCROLL_TO,
  EVENT_SOURCE,
  TIMING,
  SCROLL,
} from '../constants.js';
import ElementRegistryController from '../controllers/element-registry-controller.js';
import ScrollTargetController from '../controllers/scroll-target-controller.js';
import ActiveIndicatorController from '../controllers/active-indicator-controller.js';

// Import utilities
import * as navigationHelper from '../utils/navigation-helper.js';
import * as treeBuilder from '../utils/navigation-tree-builder.js';
import { generateArrayItem } from '../utils/data-generator.js';
import { parseArrayItemPointer, buildArrayItemPointer } from '../utils/pointer-utils.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);

const style = await getStyle(import.meta.url);

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
    activePointer: { attribute: false },
    _nav: { state: true },
    _navTree: { state: true },
  };

  // ============================================
  // INITIALIZATION
  // ============================================

  constructor() {
    super();
    this._headerRef = createRef();
    this._resizeTimer = null;
    this._navTree = [];

    // Unified element registry for nav items
    this._registry = new ElementRegistryController(this);

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

    this._indicatorController = new ActiveIndicatorController(this, {
      getIndicator: () => this._indicatorEl,
      getList: () => this._navListEl,
      getRegistry: () => this._registry,
    });

    this._onHeaderBadgeClick = this._handleHeaderBadgeClick.bind(this);
    this._handleBadgeClick = this._handleBadgeClick.bind(this);
    this._handleInsertArrayItem = this._handleInsertArrayItem.bind(this);
    this._handleRemoveArrayItem = this._handleRemoveArrayItem.bind(this);
    this._handleAddToArrayEnd = this._handleAddToArrayEnd.bind(this);
    this._handleMoveToPosition = this._handleMoveToPosition.bind(this);
    this._debouncedResize = createDebouncedHandler(
      () => {
        this._indicatorController?.updatePosition(this.activePointer);
      },
      TIMING.DEBOUNCE_DELAY,
    );
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];

    this.addEventListener('header-badge-click', this._onHeaderBadgeClick);

    this.addEventListener('scroll', () => {
      this._indicatorController?.updatePosition(this.activePointer);
    }, { passive: true });
    window.addEventListener('resize', this._debouncedResize);
  }

  disconnectedCallback() {
    this.removeEventListener('header-badge-click', this._onHeaderBadgeClick);
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

    // Update indicator position when nav tree is rendered or active pointer changes
    if (changedProps.has('_navTree') || changedProps.has('activePointer')) {
      const activePointer = this.activePointer || this._nav?.pointer;
      this._indicatorController?.updatePosition(activePointer);
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
        { source: EVENT_SOURCE.NAVIGATION, reason: 'header-badge' },
      );
    }
  }

  _handleBadgeClick(e) {
    e?.stopPropagation();
    // Get pointer from the badge's parent li element
    const badge = e.target;
    const li = badge.closest('li');
    const pointer = li?.getAttribute('data-key');
    if (pointer === null || pointer === undefined) return;

    navigationHelper.navigateToFirstError(
      pointer,
      this.formModel,
      this.validationState,
      { source: EVENT_SOURCE.NAVIGATION, reason: 'validation-badge' },
    );
  }

  _handleInsertArrayItem(event) {
    const { pointer, mode = 'after' } = event.detail;

    const { arrayPointer, index: currentIndex } = parseArrayItemPointer(pointer);

    const arrayNode = this.formModel?.getNode(arrayPointer);
    if (!arrayNode || !arrayNode.canAddMore) {
      return;
    }

    const insertIndex = mode === 'before' ? currentIndex : currentIndex + 1;
    const newItemPointer = `${arrayPointer}/${insertIndex}`;

    // eslint-disable-next-line no-underscore-dangle
    const itemValue = generateArrayItem(arrayNode.schema, this.formModel._schema);

    this.dispatchEvent(new CustomEvent('form-model-intent', {
      detail: {
        op: 'add',
        path: newItemPointer,
        value: itemValue,
        focusAfter: newItemPointer,
        focusSource: 'navigation',
      },
      bubbles: true,
      composed: true,
    }));
  }

  _handleRemoveArrayItem(event) {
    const { pointer } = event.detail;

    this.dispatchEvent(new CustomEvent('form-model-intent', {
      detail: {
        op: 'remove',
        path: pointer,
      },
      bubbles: true,
      composed: true,
    }));
  }

  _handleAddToArrayEnd(event) {
    const { pointer: arrayPointer } = event.detail;

    const arrayNode = this.formModel?.getNode(arrayPointer);
    if (!arrayNode || !arrayNode.canAddMore) {
      return;
    }

    const nextIndex = arrayNode.itemCount;
    const newItemPointer = `${arrayPointer}/${nextIndex}`;

    // eslint-disable-next-line no-underscore-dangle
    const itemValue = generateArrayItem(arrayNode.schema, this.formModel._schema);

    this.dispatchEvent(new CustomEvent('form-model-intent', {
      detail: {
        op: 'add',
        path: newItemPointer,
        value: itemValue,
        focusAfter: newItemPointer,
        focusSource: 'navigation',
      },
      bubbles: true,
      composed: true,
    }));
  }

  _handleMoveToPosition(event) {
    const { pointer, targetPosition } = event.detail;

    // Extract current index and array pointer
    const { arrayPointer, index: currentIndex } = parseArrayItemPointer(pointer);

    // If already at target position, do nothing
    if (currentIndex === targetPosition) {
      return;
    }

    const newPointer = buildArrayItemPointer(arrayPointer, targetPosition);

    // Dispatch move operation with target pointer for focusing after update
    this.dispatchEvent(new CustomEvent('form-model-intent', {
      detail: {
        op: 'move',
        path: pointer,
        from: currentIndex,
        to: targetPosition,
        focusAfter: newPointer,
        focusSource: 'navigation',
      },
      bubbles: true,
      composed: true,
    }));
  }

  // ============================================
  // RENDERING HELPERS
  // ============================================

  /**
   * Get node metadata for rendering
   */
  _getNodeMetadata(item) {
    const { isArrayItem, arrayIndex: itemIndex, parentPointer } = item;
    const parentNode = isArrayItem ? this.formModel?.getNode(parentPointer) : null;
    const node = this.formModel?.getNode?.(item.id);
    const isArray = node?.type === 'array';

    return {
      node,
      parentNode,
      isArray,
      isArrayItem,
      itemIndex,
      isActive: item.id === this.activePointer,
      canRemove: isArrayItem && parentNode?.canRemoveItems,
      canAddToArray: isArray
        && node?.canAddMore
        && !node?.isPrimitiveArray
        && !node?.itemsArePrimitiveArrays,
    };
  }

  /**
   * Render icon based on node type
   */
  _renderIcon(isArray) {
    return isArray
      ? html`
        <svg class="nav-item-icon" width="14" height="14" viewBox="0 0 32 32">
          <rect width="32" height="32" class="nav-icon-bg" rx="4" />
          <rect x="4" y="24" width="24" height="2" class="nav-icon-fill" />
          <path d="M26,18H6V14H26v4m2,0V14a2,2,0,0,0-2-2H6a2,2,0,0,0-2,2v4a2,2,0,0,0,2,2H26a2,2,0,0,0,2-2Z"
            class="nav-icon-fill" />
          <rect x="4" y="6" width="24" height="2" class="nav-icon-fill" />
        </svg>
      `
      : html`
        <svg class="nav-item-icon" width="14" height="14" viewBox="0 0 14 14">
          <circle cx="7" cy="7" r="7" class="nav-icon-bg" />
          <circle cx="7" cy="7" r="3.5" class="nav-icon-fill" />
        </svg>
      `;
  }

  /**
   * Render move to position button
   */
  _renderMoveButton(item, itemIndex) {
    // Get fresh sibling count from formModel instead of cached parentNode
    const siblings = item.parentPointer ? this.formModel?.getChildren(item.parentPointer) : [];
    const siblingCount = siblings.length;

    if (siblingCount <= 1) return nothing;

    // itemIndex is 1-based, convert to 0-based
    const currentIndex = itemIndex - 1;

    return html`
      <move-to-position-button
        slot="actions"
        .pointer=${item.id}
        .currentIndex=${currentIndex}
        .totalItems=${siblingCount}
        @confirm-move=${this._handleMoveToPosition}
      ></move-to-position-button>
    `;
  }

  /**
   * Render insert sibling button
   */
  _renderInsertButton(itemId, itemIndex, parentNode) {
    if (!parentNode?.canAddMore) return nothing;

    return html`
      <insert-button
        slot="actions"
        .pointer=${itemId}
        ?disabled=${!parentNode.canAddMore}
        .index=${itemIndex}
        .mode=${'after'}
        showLabel=${true}
        label="Insert sibling"
        @confirm-insert=${this._handleInsertArrayItem}
      ></insert-button>
    `;
  }

  /**
   * Render remove item button
   */
  _renderRemoveButton(itemId, itemIndex, parentNode) {
    if (!parentNode?.canRemoveItems) return nothing;

    return html`
      <remove-button
        slot="actions"
        .pointer=${itemId}
        ?disabled=${parentNode.isAtMinItems}
        .index=${itemIndex}
        @confirm-remove=${this._handleRemoveArrayItem}
      ></remove-button>
    `;
  }

  /**
   * Render add child item button
   */
  _renderAddChildButton(itemId, node) {
    if (!node?.canAddMore) return nothing;

    return html`
      <insert-button
        slot="actions"
        .pointer=${itemId}
        ?disabled=${!node.canAddMore}
        showLabel=${true}
        label="Add child item"
        @confirm-insert=${this._handleAddToArrayEnd}
      ></insert-button>
    `;
  }

  /**
   * Build action menu based on item capabilities
   */
  _renderActionMenu(item, metadata) {
    const {
      isArrayItem, node, parentNode, canRemove, canAddToArray, itemIndex,
    } = metadata;

    const hasArrayItemActions = isArrayItem && (canRemove || parentNode?.canAddMore);
    const hasArrayActions = canAddToArray && !isArrayItem;
    const hasBothActions = isArrayItem && canAddToArray;

    if (!hasArrayItemActions && !hasArrayActions) {
      return nothing;
    }

    let label = 'Array actions';
    if (hasBothActions) {
      label = 'Item and array actions';
    } else if (hasArrayItemActions) {
      label = 'Item actions';
    }

    return html`
      <action-menu label="${label}" align="right" class="nav-item-actions">
        ${this._renderMoveButton(item, itemIndex)}
        ${this._renderInsertButton(item.id, itemIndex, parentNode)}
        ${this._renderRemoveButton(item.id, itemIndex, parentNode)}
        ${hasArrayActions || hasBothActions
        ? this._renderAddChildButton(item.id, node)
        : nothing}
      </action-menu>
    `;
  }

  /**
   * Get item title for add button tooltip (handles $ref)
   */
  _getArrayItemTitle(item, node) {
    const itemsSchema = node.schema?.items;

    // Strategy 1: Get from existing children (handles $ref)
    if (item.children?.length > 0) {
      const firstChild = this.formModel?.getNode(item.children[0].id);
      if (firstChild?.title) {
        return firstChild.title;
      }
    }

    // Strategy 2: Direct title from items schema
    if (itemsSchema?.title) {
      return itemsSchema.title;
    }

    return 'Item';
  }

  /**
   * Render add item button for arrays
   */
  _renderAddItemButton(item, node) {
    const itemTitle = this._getArrayItemTitle(item, node);
    const nextIndex = (node.itemCount || 0) + 1;

    return html`
      <li class="nav-add-item">
        <div class="nav-row">
          <svg class="nav-add-icon" width="14" height="14" viewBox="0 0 14 14">
            <circle cx="7" cy="7" r="7" fill="#f0f7ff" />
            <path d="M7 3v8M3 7h8" stroke="#1473e6" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <button
            class="nav-add-button"
            ?disabled=${!node.canAddMore}
            title="Add #${nextIndex} ${itemTitle}"
            @click=${(e) => {
        e.stopPropagation();
        this._handleAddToArrayEnd({ detail: { pointer: item.id } });
      }}
          >Add item</button>
        </div>
      </li>
    `;
  }

  // ============================================
  // MAIN RENDERING
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
    // Get all metadata in one place
    const metadata = this._getNodeMetadata(item);
    const { node, isArray, isActive, canAddToArray } = metadata;

    // Build components using helper methods
    const icon = this._renderIcon(isArray);
    const actionMenu = this._renderActionMenu(item, metadata);

    // Main item render
    return html`
      <li data-key="${item.id}" ?data-active=${isActive} ${this.createNavItemRef(item.id)}>
        <div class="nav-row">
          ${icon}
          <navigation-item
            label="${item.label}"
            pointer="${item.id}"
            ?active=${isActive}
          ></navigation-item>
          <div class="nav-badges">
            ${actionMenu}
            ${item.badge > 0 ? html`
              <error-badge
                .count=${item.badge}
                label="Jump to first error in ${item.label} (${item.badge} issues)"
                @error-badge-click=${(e) => this._handleBadgeClick(e)}
              ></error-badge>
            ` : nothing}
          </div>
        </div>
        ${item.children?.length > 0 || canAddToArray ? html`
          <ul>
            ${(item.children || []).map((child) => this.renderNavItem(child))}
            ${canAddToArray ? this._renderAddItemButton(item, node) : nothing}
          </ul>
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
        <ul>
          ${this._navTree.map((item) => this.renderNavItem(item))}
        </ul>
      </div>
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
