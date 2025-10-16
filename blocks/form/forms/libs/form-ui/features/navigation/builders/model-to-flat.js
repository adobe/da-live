import { render } from 'da-lit';
import { navItemTemplate, navAddItemTemplate, navArrayChildItemTemplate, navSectionTitleTemplate } from '../../../templates/nav.js';
import { pointerToInputName } from '../../../form-model/path-utils.js';
import { hyphenatePath } from '../../../form-generator/path-utils.js';

/**
 * Build flat nav item elements by traversing the read-only FormUiModel tree.
 * Pure: does not mutate controller; returns an array of HTMLElements.
 *
 * @param {import('../../../form-generator.js').default} formGenerator
 * @param {object} modelNode
 * @param {number} level
 * @param {{ suppressSelf?: boolean }} options
 * @returns {HTMLElement[]}
 */
export function buildFlatNavFormUiModel(formGenerator, modelNode, level = 0, options = {}) {
  const { suppressSelf = false } = options;
  const items = [];
  if (!modelNode) return items;

  const dottedPath = modelNode.dataPath ? pointerToInputName(modelNode.dataPath) : 'root';
  const schemaSvc = formGenerator.context.services.schema;
  const pointer = modelNode.schemaPointer || '#';
  const norm = schemaSvc.getEffectiveNodeAtPointer(formGenerator.schema, pointer) || {};

  if (modelNode.type === 'object') {
    const hasPrimitives = formGenerator.hasPrimitiveFields(norm);
    const hasChildren = !!(norm && norm.properties && Object.keys(norm.properties).length > 0);
    const titleKey = dottedPath === 'root' ? '' : (dottedPath.split('.').pop() || '');
    const title = dottedPath === 'root'
      ? (schemaSvc.getTitleAtPointer(formGenerator.schema, '#', '') || 'Form')
      : schemaSvc.getTitleAtPointer(formGenerator.schema, pointer, titleKey);

    // If this object group is activatable, render only an Activate control and stop
    if (modelNode.activatable) {
      const mount = document.createElement('div');
      render(navAddItemTemplate({ path: dottedPath, groupId: `form-activate-${hyphenatePath(dottedPath)}`, level: level, title: `+ Activate '${title}'` }), mount);
      const el = mount.firstElementChild;
      try { el.classList.add('form-ui-activatable'); } catch { }
      items.push(el);
      return items;
    }

    if (!suppressSelf) {
      if (hasPrimitives) {
        const groupId = formGenerator.pathToGroupId(dottedPath);
        const mount = document.createElement('div');
        render(navItemTemplate({ groupId, level, title }), mount);
        items.push(mount.firstElementChild);
      } else if (hasChildren && dottedPath !== 'root') {
        const sectionId = `form-section-${formGenerator.hyphenatePath(dottedPath)}`;
        const mount = document.createElement('div');
        render(navSectionTitleTemplate({ groupId: sectionId, level, path: dottedPath, title }), mount);
        items.push(mount.firstElementChild);
      }
    }

    if (modelNode.children) {
      const nextLevelForChildren = suppressSelf ? level : (level + 1);
      Object.values(modelNode.children).forEach((child) => {
        const childItems = buildFlatNavFormUiModel(formGenerator, child, nextLevelForChildren);
        if (childItems && childItems.length) items.push(...childItems);
      });
    }
    return items;
  }

  if (modelNode.type === 'array') {
    const groupId = formGenerator.pathToGroupId(dottedPath);
    const titleKey = dottedPath.split('.').pop() || '';
    const title = schemaSvc.getTitleAtPointer(formGenerator.schema, pointer, titleKey);
    {
      const mount = document.createElement('div');
      render(navItemTemplate({ groupId, level, title }), mount);
      const el = mount.firstElementChild;
      el.dataset.arrayPath = dottedPath;
      if (modelNode.activatable) {
        try { el.classList.add('form-ui-activatable'); } catch { }
      }
      items.push(el);
    }

    if (modelNode.activatable) {
      const mount = document.createElement('div');
      render(navAddItemTemplate({ path: dottedPath, groupId: `form-add-${hyphenatePath(dottedPath)}`, level: level + 1, title: `+ Add '${title}' Item` }), mount);
      const el = mount.firstElementChild;
      el.dataset.arrayPath = dottedPath;
      try { el.classList.add('form-ui-activatable'); } catch { }
      items.push(el);
      return items;
    }

    const itemSchema = schemaSvc.getArrayItemsAtPointer(formGenerator.schema, pointer) || {};
    const itemTitle = schemaSvc.getSchemaTitle(formGenerator.schema, itemSchema, titleKey);
    const itemsCount = Array.isArray(modelNode.items) ? modelNode.items.length : 0;
    for (let i = 0; i < itemsCount; i += 1) {
      const child = modelNode.items[i];
      const itemGroupId = formGenerator.arrayItemId(dottedPath, i);
      const mount = document.createElement('div');
      render(navArrayChildItemTemplate({ groupId: itemGroupId, level: level + 1, arrayPath: dottedPath, itemIndex: i, title: `${itemTitle} #${i + 1}` }), mount);
      const itemNav = mount.firstElementChild;
      items.push(itemNav);

      const childItems = buildFlatNavFormUiModel(formGenerator, child, level + 2, { suppressSelf: true });
      if (childItems && childItems.length) items.push(...childItems);
    }

    {
      const mount = document.createElement('div');
      render(navAddItemTemplate({ path: dottedPath, groupId: `form-add-${hyphenatePath(dottedPath)}`, level: level + 1, title: `+ Add '${title}' Item` }), mount);
      const el = mount.firstElementChild;
      el.dataset.arrayPath = dottedPath;
      items.push(el);
    }
    return items;
  }

  return items;
}

export default { buildFlatNavFormUiModel };


