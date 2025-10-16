/**
 * Mapping utilities for generator refs.
 * mapFieldsToGroups: links field paths to group ids for nav/validation.
 * ensureGroupRegistry: registers groups in generator.groupElements.
 */
/**
 * Mapping utilities for FormGenerator
 * - fieldToGroup: map fields to group IDs
 * - ensureGroupRegistry: register groups into generator.groupElements
 */

export function mapFieldsToGroups(generator) {
  // Purely data- and schema-driven mapping of fieldPath → groupId
  generator.fieldToGroup.clear();

  const deref = (n) => generator.derefNode(n) || n || {};
  const norm = (n) => generator.normalizeSchema(deref(n)) || deref(n) || {};
  const hasPrims = (obj) => generator.hasPrimitiveFields ? generator.hasPrimitiveFields(obj) : false;

  const isArrayItemRootPath = (p) => /\[\d+\]$/.test(String(p));
  const parentArrayPathAndIndex = (p) => {
    const m = String(p).match(/^(.*)\[(\d+)\]$/);
    return m ? { arrayPath: m[1], index: Number(m[2]) } : null;
  };

  const mapObject = (schemaNode, objectPath, inArrayItemRoot, currentGroupId) => {
    const s = norm(schemaNode);
    if (!s || s.type !== 'object' || !s.properties) return;

    // Decide if this object renders its own group container in content (except array item roots)
    const rendersGroup = hasPrims(s) && !inArrayItemRoot;
    // Normalize empty root path to 'root' so IDs and mappings are consistent
    const idPath = objectPath && objectPath.length > 0 ? objectPath : 'root';
    const nextGroupId = rendersGroup
      ? generator.pathToGroupId(idPath)
      : (currentGroupId || (inArrayItemRoot && parentArrayPathAndIndex(objectPath)
        ? generator.arrayItemId(parentArrayPathAndIndex(objectPath).arrayPath, parentArrayPathAndIndex(objectPath).index)
        : generator.pathToGroupId('root')));

    const requiredSet = new Set(s.required || []);

    Object.entries(s.properties).forEach(([key, original]) => {
      const child = norm(original);
      const childPath = objectPath ? `${objectPath}.${key}` : key;

      const isObjectType = !!(child && (child.type === 'object' || child.properties));
      const isArrayOfObjects = !!(child && child.type === 'array' && (
        (child.items && (child.items.type === 'object' || child.items.properties)) || !!child.items?.$ref
      ));

      if (isObjectType) {
        mapObject(child, childPath, false, nextGroupId);
        return;
      }

      if (isArrayOfObjects) {
        const arr = generator.model.getNestedValue(generator.data, childPath) || [];
        if (Array.isArray(arr)) {
          const itemSchema = norm(child.items);
          arr.forEach((_, idx) => {
            const itemPath = `${childPath}[${idx}]`;
            mapObject(itemSchema, itemPath, true, nextGroupId);
          });
        }
        return;
      }

      // Primitive field: map to the best group id
      const fieldPath = childPath;
      let groupId = nextGroupId;
      // If this is inside an array item root and no inner group exists, prefer the array item id
      if (inArrayItemRoot && isArrayItemRootPath(objectPath)) {
        const meta = parentArrayPathAndIndex(objectPath);
        if (meta) groupId = generator.arrayItemId(meta.arrayPath, meta.index);
      }
      if (groupId) generator.fieldToGroup.set(fieldPath, groupId);
    });
  };

  const root = norm(generator.schema);
  if (root && root.type === 'object' && root.properties) {
    mapObject(root, '', false, generator.pathToGroupId('root'));
  }
}

export function ensureGroupRegistry(generator) {
  if (!generator?.container) return;
  const groups = generator.container.querySelectorAll('.form-ui-group[id], .form-ui-array-item[id]');
  groups.forEach((el) => {
    const id = el.id;
    if (!generator.groupElements.has(id)) {
      // Titles for grouping (optional, can be empty; breadcrumb now schema-driven)
      const titlePath = [];
      const titleText = el.querySelector('.form-ui-group-title')?.textContent || el.querySelector('.form-ui-label')?.textContent || '';
      generator.groupElements.set(id, {
        element: el,
        path: titlePath,
        title: titleText,
        schemaPath: el.dataset?.schemaPath || '',
        isSection: false,
      });
    }
  });
}

export default { mapFieldsToGroups, ensureGroupRegistry };


