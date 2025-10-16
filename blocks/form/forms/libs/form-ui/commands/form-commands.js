/**
 * Form Commands (core)
 *
 * Factory returning high-level commands that mutate the data model and then
 * rebuild the UI, keeping validation and navigation in sync.
 * Exposes: activateOptional, addArrayItem, removeArrayItem, reorderArrayItem, resetAll.
 */

/**
 * @param {import('../form-generator.js').default} generator
 * @returns {{
 *  activateOptional(path:string):void,
 *  addArrayItem(arrayPath:string):void,
 *  removeArrayItem(arrayPath:string,index:number):void,
 *  reorderArrayItem(arrayPath:string,fromIndex:number,toIndex:number):void,
 *  resetAll():void
 * }}
 */
export default function createFormCommands(generator) {
  return {
    activateOptional(path) {
      const node = generator.model.resolveSchemaByPath(path);
      if (!node) return;
      generator.onActivateOptionalGroup(path, node);
      const normalized = generator.normalizeSchema(node);
      if (normalized && normalized.type === 'array') {
        generator.updateData();
        let arr = generator.model.getNestedValue(generator.data, path);
        if (!Array.isArray(arr) || arr.length === 0) {
          if (!Array.isArray(arr)) arr = [];
          const baseItem = generator.createDefaultObjectFromSchema(
            generator.derefNode(normalized.items) || normalized.items || {},
          );
          generator.model.pushArrayItem(generator.data, path, baseItem);
          generator.rebuildBody();
          generator.validation.validateAllFields();
        }
      }
    },

    addArrayItem(arrayPath) {
      generator.updateData();
      const node = generator.model.resolveSchemaByPath(arrayPath);
      const normalized = generator.normalizeSchema(node);
      if (!normalized || normalized.type !== 'array') return;
      const baseItem = generator.createDefaultObjectFromSchema(
        generator.derefNode(normalized.items) || normalized.items || {},
      );
      generator.model.pushArrayItem(generator.data, arrayPath, baseItem);
      generator.rebuildBody();
      generator.validation.validateAllFields();
    },

    removeArrayItem(arrayPath, index) {
      // Compute navigation target before mutation
      generator.updateData();
      const node = generator.model.resolveSchemaByPath(arrayPath);
      const norm = generator.normalizeSchema(node || {});
      const isArrayOfObjects = !!(norm && norm.type === 'array' && (
        (norm.items && (generator.normalizeSchema(generator.derefNode(norm.items) || norm.items || {})?.type === 'object'
          || generator.normalizeSchema(generator.derefNode(norm.items) || norm.items || {})?.properties))
      ));
      const beforeArr = generator.model.getNestedValue(generator.data, arrayPath) || [];
      const parentPath = arrayPath.includes('.') ? arrayPath.slice(0, arrayPath.lastIndexOf('.')) : 'root';
      const parentGroupId = generator.pathToGroupId(parentPath || 'root');
      const nextIndex = Math.max(0, Math.min(index, (Array.isArray(beforeArr) ? beforeArr.length - 2 : 0)));

      // Mutate data and rebuild
      generator.model.removeArrayItem(generator.data, arrayPath, index);
      generator.rebuildBody();
      // Clear stale errors that may reference removed item indices
      try { generator.validation.pruneStaleFieldErrors?.(); } catch { }
      generator.validation.validateAllFields();

      // After DOM rebuild, restore a sensible active highlight
      requestAnimationFrame(() => {
        try {
          const afterArr = generator.model.getNestedValue(generator.data, arrayPath) || [];
          if (isArrayOfObjects && Array.isArray(afterArr) && afterArr.length > 0) {
            const targetId = generator.arrayItemId(arrayPath, Math.max(0, Math.min(nextIndex, afterArr.length - 1)));
            generator.navigation.navigateToGroup(targetId);
          } else {
            generator.navigation.updateActiveGroup(parentGroupId);
            generator.navigation.updateContentBreadcrumb(parentGroupId);
          }
        } catch { }
      });
    },

    reorderArrayItem(arrayPath, fromIndex, toIndex) {
      generator.reorderArrayItem(arrayPath, fromIndex, toIndex);
    },

    resetAll() {
      const base = generator.generateBaseJSON(generator.schema);
      generator.data = base;
      generator.rebuildBody();
      generator.validation.validateAllFields();
    },
  };
}


