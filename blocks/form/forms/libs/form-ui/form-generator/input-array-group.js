import { render } from 'da-lit';
import { UI_CLASS as CLASS } from '../constants.js';
import { arrayContainerTemplate, arrayItemTemplate, arrayAddButtonTemplate, removeButtonTemplate } from '../templates/array.js';
import { inputNameToPointer, findModelNodeByPointer } from '../form-model/path-utils.js';

export default function createArrayGroupUI(generator, fieldPath, propSchema) {
  const itemsSchema = generator.derefNode(propSchema.items) || propSchema.items;
  const normItemsSchema = generator.normalizeSchema(itemsSchema) || itemsSchema || {};

  // Create container using template
  const containerMount = document.createElement('div');
  render(arrayContainerTemplate({ fieldPath, items: '' }), containerMount);
  const container = containerMount.firstElementChild;
  const itemsContainer = container.querySelector(`.${CLASS.arrayItems}`) || container.querySelector('.form-ui-array-items');

  // Use the title of the ITEMS schema (object) for per-item labels so it
  // matches navigation (e.g., "Item #1")
  const baseTitle = generator.getSchemaTitle(normItemsSchema, fieldPath.split('.').pop());

  // Create add button
  const addBtnMount = document.createElement('div');
  const onAddClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    generator.commandAddArrayItem(fieldPath);
    requestAnimationFrame(() => {
      const arr = generator.model.getNestedValue(generator.data, fieldPath) || [];
      const newIndex = Math.max(0, arr.length - 1);
      const targetId = generator.arrayItemId(fieldPath, newIndex);
      const el = generator.container?.querySelector?.(`#${targetId}`);
      if (el && el.id) generator.navigation.navigateToGroup(el.id);
      generator.validation.validateAllFields();
    });
  };
  const onAddFocus = (e) => generator.navigation?.highlightActiveGroup?.(e.target);
  render(arrayAddButtonTemplate({ label: `Add '${baseTitle}' Item`, path: fieldPath, onClick: onAddClick, onFocus: onAddFocus }), addBtnMount);
  const addButton = addBtnMount.firstElementChild;

  // Path helpers to find model nodes for each item
  const dotToPointer = (dot) => inputNameToPointer(dot);

  const addItemAt = (index) => {
    const itemId = generator.arrayItemId(fieldPath, index);
    const itemDotPath = `${fieldPath}[${index}]`;

    // Delegate item rendering to GroupBuilder using FormUiModel node
    const itemPointer = dotToPointer(itemDotPath);
    const modelNode = findModelNodeByPointer(generator.formUiModel, itemPointer);

    // Build inner content into a wrapper element
    const contentWrapper = document.createElement('div');
    if (modelNode) {
      generator.groupBuilder.buildFormUiModel(contentWrapper, modelNode, [], new Map(), 0);
    } else {
      // Fallback to direct primitive rendering if model node is missing
      generator.generateObjectFields(
        contentWrapper,
        normItemsSchema.properties || {},
        normItemsSchema.required || [],
        itemDotPath,
      );
    }

    // Remove button
    let confirmState = false;
    const removeMount = document.createElement('div');
    const reRenderRemove = () => {
      render(removeButtonTemplate({
        confirm: confirmState, onClick: (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          if (confirmState) {
            generator.commandRemoveArrayItem(fieldPath, index);
            requestAnimationFrame(() => generator.validation.validateAllFields());
          } else {
            confirmState = true;
            reRenderRemove();
            setTimeout(() => { confirmState = false; reRenderRemove(); }, 3000);
          }
        }
      }), removeMount);
    };
    reRenderRemove();

    const mount = document.createElement('div');
    render(arrayItemTemplate({ id: itemId, title: `${baseTitle} #${index + 1}`, content: contentWrapper, removeButton: removeMount.firstElementChild }), mount);
    const itemContainer = mount.firstElementChild;
    itemContainer.dataset.schemaPath = itemDotPath;

    itemsContainer.appendChild(itemContainer);
    generator.ensureGroupRegistry();
  };

  container.appendChild(addButton);

  const existing = generator.model.getNestedValue(generator.data, fieldPath);
  const arrayPointer = inputNameToPointer(fieldPath);
  const arrayModelNode = findModelNodeByPointer(generator.formUiModel, arrayPointer);

  let initialCount = Array.isArray(existing) ? existing.length : 0;
  if (initialCount === 0 && arrayModelNode && Array.isArray(arrayModelNode.items) && arrayModelNode.items.length > 0) {
    // Use FormUiModel's seeded items when data is empty
    initialCount = arrayModelNode.items.length;
  }
  for (let i = 0; i < initialCount; i += 1) addItemAt(i);

  return container;
}
