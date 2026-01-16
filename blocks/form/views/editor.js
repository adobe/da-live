import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import './components/editor/generic-field/generic-field.js';
import './components/editor/form-item-group/form-item-group.js';
import './components/navigation/breadcrumb-nav/breadcrumb-nav.js';
import './components/navigation/navigation-activation-item/navigation-activation-item.js';
import './components/shared/action-menu/action-menu.js';
import './components/shared/remove-button/remove-button.js';
import './components/shared/insert-button/insert-button.js';
import './components/shared/add-item-button/add-item-button.js';
import './components/shared/move-to-position-button/move-to-position-button.js';
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

// Import utilities
import * as fieldHelper from '../utils/field-helper.js';
import * as validationHelper from '../utils/validation-helper.js';
import * as navigationHelper from '../utils/navigation-helper.js';
import * as breadcrumbHelper from '../utils/breadcrumb-helper.js';
import * as focusHelper from '../utils/focus-helper.js';
import { generateArrayItem } from '../utils/data-generator.js';
import { parseArrayItemPointer, buildArrayItemPointer, getParentPointer, isPointerDefined } from '../utils/pointer-utils.js';

const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);

const style = await getStyle(import.meta.url);

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
    activePointer: { attribute: false },
    _data: { state: true },
  };

  constructor() {
    super();
    this._headerRef = createRef();

    this._registry = new ElementRegistryController(this);

    this._visibleGroups = new VisibleGroupController(this, {
      getGroupId: (el) => el?.getAttribute?.('pointer'),
      getMeasureTarget: (el) => el?.shadowRoot?.firstElementChild || el,
      topOffsetPx: 0,
    });

    this._scrollTarget = new ScrollTargetController(this, {
      scrollEvent: EVENT_EDITOR_SCROLL_TO,
      getTarget: (pointer) => this._registry.get(pointer),
      getHeaderOffset: () => getHeaderOffsetPx(this._headerRef.value),
      scrollBehavior: SCROLL.BEHAVIOR,
    });

    this.validationState = null;
    this._fieldPropsMap = new Map();

    this._handleTargetFieldFocus = this._handleTargetFieldFocus.bind(this);
    this._handleFieldValueChange = this._handleFieldValueChange.bind(this);
    this._handleBreadcrumbNavigation = this._handleBreadcrumbNavigation.bind(this);
    this._handleSectionNavigation = this._handleSectionNavigation.bind(this);
    this._handleInsertArrayItem = this._handleInsertArrayItem.bind(this);
    this._handleRemoveArrayItem = this._handleRemoveArrayItem.bind(this);
    this._handleAddToArrayEnd = this._handleAddToArrayEnd.bind(this);
    this._handleFieldClick = this._handleFieldClick.bind(this);
    this._handleMoveToPosition = this._handleMoveToPosition.bind(this);
  }

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

  _buildFieldPropsCache() {
    this._fieldPropsMap.clear();

    if (!this.formModel) return;

    const fields = this.formModel.getFields();
    fields.forEach((field) => {
      this._fieldPropsMap.set(field.pointer, {
        type: fieldHelper.determineFieldType(field.schema),
        label: `${field.title}${field.required ? ' *' : ''}`,
        error: validationHelper.getFieldError(field.pointer, this.validationState),
        required: field.required,
        options: fieldHelper.getEnumOptions(field.schema),
      });
    });
  }

  updateHeaderOffsetVar() {
    const headerOffset = getHeaderOffsetPx(this._headerRef.value);
    this.style.setProperty('--editor-header-height', `${headerOffset}px`);

    // Add extra offset so item must be more visible before becoming active
    // This prevents breadcrumb from switching when item is mostly hidden under header
    const additionalOffset = 80; // pixels below header before item is considered "visible"
    const totalOffset = headerOffset + additionalOffset;
    this._visibleGroups?.setTopOffsetPx(totalOffset);
  }

  observeHeaderResize() {
    const header = this._headerRef.value;
    if (!header || typeof ResizeObserver === 'undefined') return;

    this._headerResizeObserver = new ResizeObserver(() => {
      this.updateHeaderOffsetVar();
    });
    this._headerResizeObserver.observe(header);
  }

  get visiblePointer() {
    return this._visibleGroups?.visiblePointer;
  }

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

  _handleTargetFieldFocus(e) {
    const targetPointer = e.detail?.targetFieldPointer;
    if (targetPointer == null) return;

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
    const fieldPointer = e.detail.id;
    const parentPointer = getParentPointer(fieldPointer);

    if (parentPointer != null) {
      navigationHelper.navigateToPointer(parentPointer, { source: 'editor' });
    }
  }

  render() {
    if (!this._data) return nothing;

    // activePointer updates from both manual clicks and natural scrolling
    const breadcrumbPointer = (this.activePointer ?? this._data.pointer);
    const segments = breadcrumbHelper.buildBreadcrumbSegments(
      this._data,
      breadcrumbPointer,
      this.formModel,
    );

    return html`
      <div class="form-header" ${ref(this._headerRef)}>
        <h2>${this._data.title}</h2>
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
    const children = this.formModel?.getChildren(item.pointer) || [];
    const isGroup = children.length > 0;

    if (item.isPrimitiveArray) {
      return this._renderPrimitiveArray(item, children);
    }

    if (!isGroup) {
      return this._renderField(item);
    }

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
        .value=${item.data}
        error=${props.error}
        required=${props.required}
        .options=${props.options}
        .onRef=${this.registerElement}
        @value-change=${this._handleFieldValueChange}
      ></generic-field>
    `;
  }

  _renderPrimitiveArray(arrayItem, children) {
    // Check if this primitive array is inside another array (array item)
    // Note: groupPointer can be '' for root's children, which is valid
    const parentNode = isPointerDefined(arrayItem.groupPointer)
      ? this.formModel?.getNode(arrayItem.groupPointer)
      : null;
    const isArrayItem = parentNode?.type === 'array';

    // Calculate item index if it's an array item
    const itemIndex = isArrayItem
      ? parseInt(arrayItem.pointer.split('/').pop(), 10) + 1
      : null;

    // Build label with index prefix if it's an array item
    const baseLabel = isArrayItem && itemIndex
      ? `#${itemIndex} ${arrayItem.title}`
      : arrayItem.title;
    const label = `${baseLabel}${arrayItem.isRequired ? ' *' : ''}`;

    const canRemove = arrayItem.canRemoveItems;
    const canAdd = arrayItem.canAddMore && arrayItem.maxItems !== 1;

    if (children.length === 0 && !arrayItem.isRequired) {
      // Get item title - for empty arrays, use items schema if it has a title
      const itemsSchema = arrayItem.schema?.items;
      const itemTitle = itemsSchema?.title || 'Item';
      const addTitle = `Add #1 ${itemTitle}`;

      return html`
        <div class="primitive-array-field primitive-array-empty" data-pointer="${arrayItem.pointer}">
          <label class="primitive-array-label">${label}</label>
          ${canAdd ? html`
            <add-item-button
              .pointer=${arrayItem.pointer}
              ?disabled=${!arrayItem.canAddMore}
              title="${addTitle}"
              @confirm-add=${(e) => this._handleAddArrayItem(e.detail.pointer, arrayItem)}
            ></add-item-button>
          ` : nothing}
        </div>
      `;
    }

    return html`
      <div class="primitive-array-field" data-pointer="${arrayItem.pointer}">
        <label class="primitive-array-label">${label}</label>
        <div class="primitive-array-items">
          ${children.map((child, index) => {
      const props = this._fieldPropsMap.get(child.pointer);
      if (!props) {
        return nothing;
      }

      // Add item number to label
      const itemLabel = `#${index + 1} ${props.label}`;

      return html`
                <div class="primitive-array-item">
                  <generic-field
                    id=${child.pointer}
                    type=${props.type}
                    label=${itemLabel}
                    .value=${child.data}
                    error=${props.error}
                    required=${props.required}
                    .options=${props.options}
                    .onRef=${this.registerElement}
                    @value-change=${this._handleFieldValueChange}
                  ></generic-field>
                  ${canRemove || canAdd ? html`
                    <action-menu label="Item actions" align="right" class="primitive-array-actions">
                      ${children.length > 1 ? html`
                        <move-to-position-button
                          slot="actions"
                          .pointer=${child.pointer}
                          .currentIndex=${index}
                          .totalItems=${children.length}
                          @confirm-move=${this._handleMoveToPosition}
                        ></move-to-position-button>
                      ` : nothing}
                      ${canAdd ? html`
                        <insert-button
                          slot="actions"
                          .pointer=${child.pointer}
                          ?disabled=${!arrayItem.canAddMore}
                          .index=${index + 1}
                          .mode=${'after'}
                          @confirm-insert=${this._handleInsertArrayItem}
                        ></insert-button>
                      ` : nothing}
                      ${canRemove ? html`
                        <remove-button
                          slot="actions"
                          .pointer=${child.pointer}
                          ?disabled=${arrayItem.isAtMinItems}
                          .index=${index + 1}
                          @confirm-remove=${this._handleRemoveArrayItem}
                        ></remove-button>
                      ` : nothing}
                    </action-menu>
                  ` : nothing}
                </div>
              `;
    })}
          ${canAdd ? (() => {
        // Get item title - check existing children first (handles $ref)
        let itemTitle = 'Item';
        const itemsSchema = arrayItem.schema?.items;

        if (children.length > 0 && children[0]?.title) {
          // Use first child's title (with automatic fallback to key)
          itemTitle = children[0].title;
        } else if (itemsSchema?.title) {
          // Use items schema title if no children
          itemTitle = itemsSchema.title;
        }

        const nextIndex = (arrayItem.itemCount || 0) + 1;

        return html`
            <add-item-button
              .pointer=${arrayItem.pointer}
              ?disabled=${!arrayItem.canAddMore}
              title="Add #${nextIndex} ${itemTitle}"
              @confirm-add=${(e) => this._handleAddArrayItem(e.detail.pointer, arrayItem)}
            ></add-item-button>
          `;
      })() : nothing}
        </div>
      </div>
    `;
  }

  _renderGroup(item) {
    const children = this.formModel?.getChildren(item.pointer) || [];
    const errorCount = validationHelper.getGroupErrorCount(
      item.pointer,
      this.validationState,
    );

    // Check if this item is inside an array (array item)
    // Note: groupPointer can be '' for root's children, which is valid
    const parentNode = isPointerDefined(item.groupPointer)
      ? this.formModel?.getNode(item.groupPointer)
      : null;
    const isArrayItem = parentNode?.type === 'array';
    const canRemove = isArrayItem && parentNode?.canRemoveItems;

    // Calculate item index if it's an array item
    const itemIndex = isArrayItem
      ? parseInt(item.pointer.split('/').pop(), 10) + 1
      : null;

    // Check if this item is an array that can add items
    const isArray = item.type === 'array';
    const canAddToArray = isArray && item.canAddMore;

    const hasArrayItemActions = isArrayItem && (canRemove || parentNode?.canAddMore);
    const hasArrayActions = canAddToArray && !isArrayItem;
    const hasBothActions = isArrayItem && canAddToArray;

    let actionMenu = nothing;
    if (hasBothActions) {
      // Get sibling count for move button - get fresh count from parent
      const siblings = isPointerDefined(item.groupPointer)
        ? this.formModel?.getChildren(item.groupPointer)
        : [];
      const siblingCount = siblings.length;
      const currentIndex = itemIndex - 1; // itemIndex is 1-based, convert to 0-based

      actionMenu = html`
        <action-menu slot="actions" label="Item and array actions" align="right">
          ${siblingCount > 1 ? html`
            <move-to-position-button
              slot="actions"
              .pointer=${item.pointer}
              .currentIndex=${currentIndex}
              .totalItems=${siblingCount}
              @confirm-move=${this._handleMoveToPosition}
            ></move-to-position-button>
          ` : nothing}
          ${parentNode?.canAddMore ? html`
            <insert-button
              slot="actions"
              .pointer=${item.pointer}
              ?disabled=${!parentNode.canAddMore}
              .index=${itemIndex}
              .mode=${'after'}
              showLabel=${true}
              label="Insert sibling"
              @confirm-insert=${this._handleInsertArrayItem}
            ></insert-button>
          ` : nothing}
          ${canRemove ? html`
            <remove-button
              slot="actions"
              .pointer=${item.pointer}
              ?disabled=${parentNode.isAtMinItems}
              .index=${itemIndex}
              @confirm-remove=${this._handleRemoveArrayItem}
            ></remove-button>
          ` : nothing}
          <insert-button
            slot="actions"
            .pointer=${item.pointer}
            ?disabled=${!item.canAddMore}
            showLabel=${true}
            label="Add child item"
            @confirm-insert=${this._handleAddToArrayEnd}
          ></insert-button>
        </action-menu>
      `;
    } else if (hasArrayItemActions) {
      // Get sibling count for move button - get fresh count from parent
      const siblings = isPointerDefined(item.groupPointer)
        ? this.formModel?.getChildren(item.groupPointer)
        : [];
      const siblingCount = siblings.length;
      const currentIndex = itemIndex - 1; // itemIndex is 1-based, convert to 0-based

      actionMenu = html`
        <action-menu slot="actions" label="Item actions" align="right">
          ${siblingCount > 1 ? html`
            <move-to-position-button
              slot="actions"
              .pointer=${item.pointer}
              .currentIndex=${currentIndex}
              .totalItems=${siblingCount}
              @confirm-move=${this._handleMoveToPosition}
            ></move-to-position-button>
          ` : nothing}
          ${parentNode?.canAddMore ? html`
            <insert-button
              slot="actions"
              .pointer=${item.pointer}
              ?disabled=${!parentNode.canAddMore}
              .index=${itemIndex}
              .mode=${'after'}
              showLabel=${true}
              label="Insert sibling"
              @confirm-insert=${this._handleInsertArrayItem}
            ></insert-button>
          ` : nothing}
          ${canRemove ? html`
            <remove-button
              slot="actions"
              .pointer=${item.pointer}
              ?disabled=${parentNode.isAtMinItems}
              .index=${itemIndex}
              @confirm-remove=${this._handleRemoveArrayItem}
            ></remove-button>
          ` : nothing}
        </action-menu>
      `;
    } else if (hasArrayActions) {
      actionMenu = html`
        <action-menu slot="actions" label="Array actions" align="right">
          <insert-button
            slot="actions"
            .pointer=${item.pointer}
            ?disabled=${!item.canAddMore}
            showLabel=${true}
            label="Add child item"
            @confirm-insert=${this._handleAddToArrayEnd}
          ></insert-button>
        </action-menu>
      `;
    }

    // Render normal group with children
    return html`
      <form-item-group
        class="item-group ${isArrayItem ? 'array-item' : ''}"
        data-key="${item.pointer}"
        id="${item.pointer}"
        pointer="${item.pointer}"
        label="${isArrayItem ? `#${itemIndex} ` : ''}${item.title}"
        badge=${errorCount}
        ?active=${item.pointer === this.activePointer}
        ${this.createGroupRef(item.pointer)}
        @section-click=${this._handleSectionNavigation}
      >
        ${actionMenu}
        
        ${children.map((child) => this._renderItem(child))}
      </form-item-group>
    `;
  }

  _handleAddArrayItem(arrayPointer, arrayNode) {
    if (!arrayNode.canAddMore) {
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
        focusSource: 'editor',
      },
      bubbles: true,
      composed: true,
    }));
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
        focusSource: 'editor',
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
        focusSource: 'editor',
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
        focusSource: 'editor',
      },
      bubbles: true,
      composed: true,
    }));
  }
}

customElements.define('da-form-editor', FormEditor);
