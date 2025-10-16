/**
 * InputFactory
 *
 * Thin facade over an input-type registry that creates controls based on JSON
 * Schema properties, and wires standardized events via injected handlers.
 */

import { render } from 'da-lit';
import { UI_CLASS as CLASS, DATA } from './constants.js';
import { registry as createRegistry } from './inputs/index.js';
import { addButtonTemplate, removeButtonTemplate } from './templates/buttons.js';
import { actionsContainerTemplate } from './templates/actions.js';

export default class InputFactory {
  /**
   * @param {object} context - Shared context (services, etc.)
   * @param {{
   *   onInputOrChange?:Function,
   *   onBlur?:Function,
   *   onFocus?:Function,
   *   getArrayValue?:Function,
   *   onArrayAdd?:Function,
   *   onArrayRemove?:Function,
   * }} handlers
   */
  constructor(context, handlers = {}) {
    const noop = () => { };
    this.onInputOrChange = handlers.onInputOrChange || noop;
    this.onBlur = handlers.onBlur || noop;
    this.onFocus = handlers.onFocus || noop;
    // Data-driven helpers for arrays (primitive arrays)
    this.getArrayValue = handlers.getArrayValue || (() => undefined);
    this.onArrayAdd = handlers.onArrayAdd || noop;
    this.onArrayRemove = handlers.onArrayRemove || noop;
    this.services = context?.services;
    this._registry = createRegistry(context, handlers);
  }

  /** Create an input control appropriate for the property schema. */
  create(fieldPath, propSchema) {
    const primaryType = Array.isArray(propSchema.type) ? (propSchema.type.find((t) => t !== 'null') || propSchema.type[0]) : propSchema.type;
    const { format, enum: enumValues } = propSchema;
    // Semantic type override (optional, non-breaking)
    const semantic = propSchema['x-semantic-type'];
    if (semantic) {
      switch (semantic) {
        case 'long-text':
          return this._registry.get('textarea').create(fieldPath, propSchema);
        case 'date':
          return this._registry.get('string').create(fieldPath, propSchema, 'date');
        case 'date-time':
          return this._registry.get('string').create(fieldPath, propSchema, 'date-time');
        case 'time':
          return this._registry.get('string').create(fieldPath, propSchema, 'time');
        case 'file':
          return this._registry.get('asset').create(fieldPath, propSchema);
        case 'image':
        case 'picture':
          return this._registry.get('asset')?.create(fieldPath, propSchema);
        case 'color':
          return this._registry.get('string').create(fieldPath, propSchema, 'color');
        default:
          if (typeof semantic === 'string' && semantic.startsWith('reference:')) {
            // For now, treat references as plain string inputs (ids/urls)
            return this._registry.get('string').create(fieldPath, propSchema);
          }
          // Unknown semantic type → fall through to default inference
          break;
      }
    }
    if (primaryType === 'array') return this.createArrayInput(fieldPath, propSchema);
    if (primaryType === 'object') return null;
    if (enumValues && primaryType === 'string') {
      const selectCreator = this._registry.get('select');
      return selectCreator.create(fieldPath, enumValues, propSchema);
    }
    if (primaryType === 'string' && format === 'textarea') {
      return this._registry.get('textarea').create(fieldPath, propSchema);
    }
    const creator = this._registry.get(primaryType) || this._registry.get('string');
    return creator.create(fieldPath, propSchema, format);
  }


  /**
   * Create a UI for arrays of primitives, including inline add/remove controls.
   * Arrays-of-objects are handled elsewhere (as repeatable object groups).
   */
  createArrayInput(fieldPath, propSchema) {
    const container = document.createElement('div');
    container.className = CLASS.arrayContainer;
    container.dataset[DATA.fieldPath] = fieldPath;

    const itemsContainer = document.createElement('div');
    itemsContainer.className = CLASS.arrayItems;
    container.appendChild(itemsContainer);

    const addBtnMount = document.createElement('div');
    const onAddFocus = (e) => this.onFocus(fieldPath, propSchema, e.target);
    render(addButtonTemplate({
      label: 'Add', path: fieldPath, onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (isPrimitiveItems) { this.onArrayAdd(fieldPath, propSchema); return; }
        if (isPrimitiveItems) {
          const currentLength = itemsContainer.querySelectorAll('.form-ui-array-item').length;
          const itemContainer = document.createElement('div');
          itemContainer.className = CLASS.arrayItem;
          const itemIndexName = `${fieldPath}[${currentLength}]`;
          const itemInput = this.create(itemIndexName, propSchema.items || { type: 'string' });

          let confirmState = false;
          const removeMount = document.createElement('div');
          const rerenderRemove = () => {
            render(removeButtonTemplate({
              confirm: confirmState, onClick: () => {
                if (confirmState) {
                  itemContainer.remove();
                  addButton.disabled = false;
                  Array.from(itemsContainer.querySelectorAll('.form-ui-array-item')).forEach((el, idx) => {
                    el.querySelectorAll('[name]').forEach((inputEl) => {
                      inputEl.name = inputEl.name.replace(/\[[0-9]+\]$/, `[${idx}]`);
                    });
                  });
                  this.onInputOrChange(fieldPath, propSchema, addButton);
                } else {
                  confirmState = true;
                  rerenderRemove();
                  setTimeout(() => { confirmState = false; rerenderRemove(); }, 3000);
                }
              }
            }), removeMount);
          };
          rerenderRemove();

          const row = document.createElement('div');
          row.className = 'form-ui-field-row';
          const main = document.createElement('div');
          main.className = 'form-ui-field-main';
          const actionsHost = document.createElement('div');
          render(actionsContainerTemplate({ forPath: fieldPath, content: removeMount.firstElementChild }), actionsHost);
          main.appendChild(itemInput);
          row.appendChild(main);
          row.appendChild(actionsHost.firstElementChild);
          itemContainer.appendChild(row);
          itemsContainer.appendChild(itemContainer);

          addButton.disabled = true;
          const ctrl = itemContainer.querySelector('input, select, textarea');
          const updateAddDisabled = () => {
            let isEmpty = true;
            if (ctrl) {
              if (ctrl.tagName === 'SELECT') isEmpty = (ctrl.value === '' || ctrl.value == null);
              else if (ctrl.type === 'checkbox') isEmpty = !ctrl.checked;
              else isEmpty = (ctrl.value === '' || ctrl.value == null);
            }
            addButton.disabled = isEmpty;
          };
          if (ctrl) ['input', 'change'].forEach((evt) => ctrl.addEventListener(evt, updateAddDisabled));
          updateAddDisabled();
        } else {
          this.onArrayAdd(fieldPath, propSchema);
        }
      }, onFocus: onAddFocus
    }), addBtnMount);
    const addButton = addBtnMount.firstElementChild;
    // Determine if items are primitives (vs objects)
    const itemsSchema = propSchema.items || {};
    const isPrimitiveItems = !(itemsSchema && (itemsSchema.type === 'object' || (Array.isArray(itemsSchema.type) && itemsSchema.type.includes('object'))));
    container.appendChild(addButton);

    // Mark as primitive array when items are not objects
    if (isPrimitiveItems) container.dataset.primitive = 'true';

    // Render existing values; when none, render one blank item input
    const arr = this.getArrayValue(fieldPath);
    if (Array.isArray(arr) && arr.length > 0) {
      arr.forEach((value, idx) => {
        const itemContainer = document.createElement('div');
        itemContainer.className = CLASS.arrayItem;
        const itemInput = this.create(`${fieldPath}[${idx}]`, propSchema.items || { type: 'string' });
        const inputEl = itemInput.querySelector?.('input, select, textarea') || itemInput;
        if (inputEl && typeof value !== 'undefined' && value !== null) {
          if (inputEl.type === 'checkbox') inputEl.checked = Boolean(value);
          else inputEl.value = String(value);
        }
        let confirmState = false;
        const removeMount = document.createElement('div');
        const rerenderRemove = () => {
          render(removeButtonTemplate({
            confirm: confirmState, onClick: () => {
              if (confirmState) {
                const idx = Array.from(itemsContainer.querySelectorAll('.form-ui-array-item')).indexOf(itemContainer);
                this.onArrayRemove(fieldPath, idx < 0 ? 0 : idx);
              } else {
                confirmState = true;
                rerenderRemove();
                setTimeout(() => { confirmState = false; rerenderRemove(); }, 3000);
              }
            }
          }), removeMount);
        };
        rerenderRemove();
        const toggleRemoveVisibility = () => {
          const total = itemsContainer.querySelectorAll('.form-ui-array-item').length;
          const ctrl = itemContainer.querySelector('input, select, textarea');
          let isBlank = true;
          if (ctrl) {
            if (ctrl.tagName === 'SELECT') isBlank = (ctrl.value === '' || ctrl.value == null);
            else if (ctrl.type === 'checkbox') isBlank = !ctrl.checked;
            else isBlank = (ctrl.value === '' || ctrl.value == null);
          }
          const btn = removeMount.firstElementChild;
          if (btn) btn.style.visibility = (total <= 1 && isBlank) ? 'hidden' : 'visible';
        };
        if (inputEl && inputEl.addEventListener) {
          ['input', 'change'].forEach((evt) => inputEl.addEventListener(evt, toggleRemoveVisibility));
        }
        const row = document.createElement('div');
        row.className = 'form-ui-field-row';
        const main = document.createElement('div');
        main.className = 'form-ui-field-main';
        const actionsHost = document.createElement('div');
        main.appendChild(itemInput);
        render(actionsContainerTemplate({ forPath: fieldPath, content: removeMount.firstElementChild }), actionsHost);
        row.appendChild(main);
        row.appendChild(actionsHost.firstElementChild);
        itemContainer.appendChild(row);
        itemsContainer.appendChild(itemContainer);
        toggleRemoveVisibility();
      });
    } else {
      // Render one blank input item when empty
      const itemContainer = document.createElement('div');
      itemContainer.className = CLASS.arrayItem;
      const itemInput = this.create(`${fieldPath}[0]`, propSchema.items || { type: 'string' });
      let confirmState = false;
      const removeMount = document.createElement('div');
      const rerenderRemove = () => {
        render(removeButtonTemplate({
          confirm: confirmState, onClick: () => {
            if (confirmState) {
              this.onArrayRemove(fieldPath, 0);
            } else {
              confirmState = true;
              rerenderRemove();
              setTimeout(() => { confirmState = false; rerenderRemove(); }, 3000);
            }
          }
        }), removeMount);
      };
      rerenderRemove();
      const toggleRemoveVisibility = () => {
        const total = itemsContainer.querySelectorAll('.form-ui-array-item').length;
        const ctrl = itemContainer.querySelector('input, select, textarea');
        let isBlank = true;
        if (ctrl) {
          if (ctrl.tagName === 'SELECT') isBlank = (ctrl.value === '' || ctrl.value == null);
          else if (ctrl.type === 'checkbox') isBlank = !ctrl.checked;
          else isBlank = (ctrl.value === '' || ctrl.value == null);
        }
        const btn = removeMount.firstElementChild;
        if (btn) btn.style.visibility = (total <= 1 && isBlank) ? 'hidden' : 'visible';
      };
      const row = document.createElement('div');
      row.className = 'form-ui-field-row';
      const main = document.createElement('div');
      main.className = 'form-ui-field-main';
      main.appendChild(itemInput);
      const actionsHost = document.createElement('div');
      render(actionsContainerTemplate({ forPath: fieldPath, content: removeMount.firstElementChild }), actionsHost);
      row.appendChild(main);
      row.appendChild(actionsHost.firstElementChild);
      itemContainer.appendChild(row);
      itemsContainer.appendChild(itemContainer);
      const ctrl = itemContainer.querySelector('input, select, textarea');
      if (ctrl && ctrl.addEventListener) {
        ['input', 'change'].forEach((evt) => ctrl.addEventListener(evt, toggleRemoveVisibility));
      }
      toggleRemoveVisibility();

      // Disable Add button until the initial blank is filled
      const updateAddDisabled = () => {
        let isEmpty = true;
        if (ctrl) {
          if (ctrl.tagName === 'SELECT') isEmpty = (ctrl.value === '' || ctrl.value == null);
          else if (ctrl.type === 'checkbox') isEmpty = !ctrl.checked;
          else isEmpty = (ctrl.value === '' || ctrl.value == null);
        }
        addButton.disabled = isEmpty;
      };
      if (ctrl && ctrl.addEventListener) {
        ['input', 'change'].forEach((evt) => ctrl.addEventListener(evt, updateAddDisabled));
      }
      updateAddDisabled();
    }

    return container;
  }

}


