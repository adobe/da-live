/**
 * field-renderer
 * Renders a single field (primitive/object/array-of-objects group placeholder),
 * delegating input creation to InputFactory and applying UI_CLASS constants.
 */
import { render } from 'da-lit';
import getControlElement from '../utils/dom-utils.js';
import { UI_CLASS as CLASS } from '../constants.js';
import { pathToGroupId, hyphenatePath } from '../form-generator/path-utils.js';
import { inputNameToPointer, findModelNodeByPointer } from '../form-model/path-utils.js';
import { groupTemplate } from '../templates/group.js';
import { fieldTemplate } from '../templates/field.js';
import { addButtonTemplate } from '../templates/buttons.js';

/**
 * Render a single field based on its schema and location in the model.
 * Handles primitives, nested objects (as inline groups), and arrays-of-objects
 * (as repeatable groups with activation placeholders).
 *
 * @param {import('../form-generator.js').default} formGenerator
 * @param {string} key - Property key
 * @param {object} propSchema - Effective property schema
 * @param {boolean} [isRequired=false] - Whether the property is required
 * @param {string} [pathPrefix=''] - Parent path prefix
 * @returns {HTMLElement} The field or group DOM element
 */
export function renderField(formGenerator, key, propSchema, isRequired = false, pathPrefix = '') {
  const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key;

  // Special-case: arrays of objects should render as a sub-group, not a simple field
  const itemSchema = formGenerator.derefNode(propSchema?.items) || propSchema?.items;
  const isArrayOfObjects = propSchema && propSchema.type === 'array' && (
    (itemSchema && (itemSchema.type === 'object' || itemSchema.properties)) || !!propSchema.items?.$ref
  );
  if (isArrayOfObjects) {
    const mount = document.createElement('div');
    render(groupTemplate({
      id: pathToGroupId(fullPath),
      breadcrumbPath: [formGenerator.formatLabel(key)],
      schemaPath: [fullPath],
      title: propSchema.title || formGenerator.formatLabel(key),
      addHeader: true,
      content: ''
    }), mount);
    const groupContainer = mount.firstElementChild;
    const groupContent = groupContainer.querySelector(`.${CLASS.groupContent}`);
    const arrayUI = formGenerator.generateInput(fullPath, propSchema);
    const existingArr = formGenerator.model.getNestedValue(formGenerator.data, fullPath);
    const isEmpty = Array.isArray(existingArr) && existingArr.length === 0;
    if (arrayUI && !isEmpty) {
      groupContent.appendChild(arrayUI);
    } else if (isEmpty) {
      const addMount = document.createElement('div');
      render(addButtonTemplate({
        label: `Add ${formGenerator.getSchemaTitle(propSchema, key)} Item`,
        path: fullPath,
        onClick: (e) => { e.preventDefault(); e.stopPropagation(); formGenerator.commandAddArrayItem(fullPath); },
        onFocus: (e) => formGenerator.navigation?.highlightActiveGroup?.(e.target)
      }), addMount);
      groupContent.appendChild(addMount.firstElementChild);
    }

    // Ensure one item is present by default when required
    if (isRequired && arrayUI) {
      const existing = formGenerator.model.getNestedValue(formGenerator.data, fullPath);
      const itemsContainer = arrayUI.querySelector?.('.form-ui-array-items');
      const addBtn = arrayUI.querySelector?.('.form-content-add');
      if (Array.isArray(existing) && existing.length === 0 && itemsContainer && itemsContainer.children.length === 0 && addBtn) {
        try { addBtn.click(); } catch { /* noop */ }
      }
    }
    groupContainer.appendChild(groupContent);

    groupContainer.dataset.fieldPath = fullPath;
    return groupContainer;
  }

  // Special-case: nested object inside array items (or any object field) should render as its own inline group
  const isObjectType = !!(propSchema && (propSchema.type === 'object' || propSchema.properties));
  if (isObjectType && propSchema.properties) {
    // Gate rendering by the FormUiModel's activation state for this object group
    const pointer = inputNameToPointer(fullPath);
    const modelNode = findModelNodeByPointer(formGenerator.formUiModel, pointer);
    const title = propSchema.title || formGenerator.formatLabel(key);

    // If activatable: render only a group wrapper with an Activate button
    if (modelNode && modelNode.activatable) {
      const mount = document.createElement('div');
      render(groupTemplate({
        id: pathToGroupId(fullPath),
        breadcrumbPath: [formGenerator.formatLabel(key)],
        schemaPath: [fullPath],
        title,
        addHeader: true,
        content: ''
      }), mount);
      const groupContainer = mount.firstElementChild;
      const groupContent = groupContainer.querySelector(`.${CLASS.groupContent}`);
      const addMount = document.createElement('div');
      render(addButtonTemplate({
        label: `Activate '${title}'`,
        path: fullPath,
        onClick: (e) => { e.preventDefault(); e.stopPropagation(); formGenerator.commandActivateOptional(fullPath); },
        onFocus: (e) => formGenerator.navigation?.highlightActiveGroup?.(e.target)
      }), addMount);
      groupContent.appendChild(addMount.firstElementChild);
      groupContainer.dataset.fieldPath = fullPath;
      return groupContainer;
    }

    // If active (or no model node info), render full group content
    const mount = document.createElement('div');
    render(groupTemplate({
      id: pathToGroupId(fullPath),
      breadcrumbPath: [formGenerator.formatLabel(key)],
      schemaPath: [fullPath],
      title,
      addHeader: true,
      content: ''
    }), mount);
    const groupContainer = mount.firstElementChild;
    const groupContent = groupContainer.querySelector(`.${CLASS.groupContent}`);
    formGenerator.generateObjectFields(
      groupContent,
      propSchema.properties || {},
      propSchema.required || [],
      fullPath,
    );
    groupContainer.appendChild(groupContent);

    groupContainer.dataset.fieldPath = fullPath;
    return groupContainer;
  }

  const input = formGenerator.generateInput(fullPath, propSchema);
  const isArrayContainer = !!(input && input.classList && input.classList.contains('form-ui-array-container'));
  const container = document.createElement('div');
  render(fieldTemplate({
    key,
    fullPath,
    label: propSchema.title || formGenerator.formatLabel(key),
    isRequired,
    inputNode: input || null,
    isArrayContainer,
    description: propSchema.description || ''
  }), container);
  const fieldEl = container.firstElementChild;
  // If field is required, visually indicate on the input with a red border (not the label)
  if (input && isRequired) {
    let targetControl = null;
    if (typeof input.matches === 'function' && input.matches('input, select, textarea')) {
      targetControl = input;
    } else if (typeof input.querySelector === 'function') {
      targetControl = input.querySelector('input, select, textarea');
    }
    if (targetControl) {
      targetControl.classList.add('required');
      targetControl.setAttribute('aria-required', 'true');
      if (!targetControl.id) {
        targetControl.id = `field-${fullPath.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
      }
      const labelEl = fieldEl?.querySelector?.(`.${CLASS.label}`) || fieldEl?.querySelector?.('.form-ui-label');
      if (labelEl) {
        labelEl.setAttribute('for', targetControl.id);
      }
    }
  }

  // Track field schema and element for initial validation on load
  if (input) {
    const controlEl = getControlElement(input);
    if (controlEl) {
      formGenerator.fieldSchemas.set(fullPath, propSchema);
      formGenerator.fieldElements.set(fullPath, controlEl);
    }
  }

  return fieldEl;
}

export default { renderField };


