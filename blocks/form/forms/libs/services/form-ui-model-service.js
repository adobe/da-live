/**
 * FormUiModelService
 *
 * Derives a read-only groups model from (schema, data). Field-level details are
 * resolved by consumers via SchemaService using the emitted schemaPointer.
 */
export class FormUiModelService {
  /**
   * @param {object} context - Global app context with service container
   */
  constructor(context) {
    this._context = context;
    this._schema = context?.services?.schema;
  }

  /**
   * Build a Form UI Model (groups-only) from schema + data.
   * @param {{ schema: any, data: any }} input
   * @param {{ freeze?: boolean }} [options]
   * @returns {object} root model node
   */
  createFormUiModel(input, options = {}) {
    const { schema, data } = input || {};
    const { freeze = false } = options;
    const schemaSvc = this._schema;

    // eslint-disable-next-line no-console
    try { console.log('[ui-model] build start', { hasData: !!data, dataType: typeof data }); } catch { }

    const normalize = (root, node) => (schemaSvc ? schemaSvc.normalizeSchema(root, node) : node);
    const deref = (root, node) => (schemaSvc ? (schemaSvc.derefNode(root, node) || node) : node);

    const isArrayOfObjects = (root, node) => {
      const n = normalize(root, deref(root, node) || node) || node;
      if (!n || n.type !== 'array') return false;
      const items = normalize(root, deref(root, n.items) || n.items) || n.items;
      if (!items) return false;
      return !!(items.type === 'object' || items.properties);
    };

    const getPropertiesAndRequired = (root, objNode) => {
      const n = normalize(root, deref(root, objNode) || objNode) || objNode;
      const props = n?.properties || {};
      const requiredSet = new Set(Array.isArray(n?.required) ? n.required : []);
      return { properties: props, requiredSet };
    };

    const isPropRequired = (rootSchema, objSchema, propKey) => {
      const n = normalize(rootSchema, deref(rootSchema, objSchema) || objSchema) || objSchema;
      const r = new Set(Array.isArray(n?.required) ? n.required : []);
      return r.has(propKey);
    };

    const getDataAtPointer = (rootData, pointer) => {
      if (!pointer) return rootData;
      const tokens = pointer.split('/').slice(1).map((t) => t.replace(/~1/g, '/').replace(/~0/g, '~'));
      let cur = rootData;
      for (const tok of tokens) {
        if (cur == null) return undefined;
        const idx = Number.isInteger(Number(tok)) && String(Number(tok)) === tok ? Number(tok) : tok;
        cur = cur?.[idx];
      }
      return cur;
    };

    // Presence check: optional object is present if property exists (not null/undefined)
    const isPresent = (value) => !(value == null);

    const buildObjectNode = (rootSchema, key, schemaPointer, dataPath, objSchema, parentActive, isRequired) => {
      // Determine presence of data for this object path
      const cur = getDataAtPointer(data, dataPath);
      const hasValue = isPresent(cur);

      // Object activation semantics:
      // - If parent inactive: inherit inactivity
      // - If required: active regardless of data presence
      // - If optional and data missing: mark activatable (gate)
      const isActive = parentActive && (isRequired || hasValue);
      const activatable = parentActive && !isRequired && !hasValue ? true : undefined;

      const node = {
        key,
        type: 'object',
        dataPath,
        schemaPointer,
        isRequired: !!isRequired,
        isActive: isActive ? true : undefined,
        activatable,
        children: undefined,
      };

      // eslint-disable-next-line no-console
      // try { console.log('[ui-model] object decision', { dataPath, key, isRequired: !!isRequired, parentActive: !!parentActive, present: hasValue, cur }); } catch { }

      // Only build children for active object groups
      if (isActive) {
        const { properties } = getPropertiesAndRequired(rootSchema, objSchema);
        const children = {};

        Object.entries(properties).forEach(([childKey, childSchema]) => {
          const childNorm = normalize(rootSchema, deref(rootSchema, childSchema) || childSchema) || childSchema;
          const childPointer = schemaSvc?.pointerOfResolvedNode
            ? schemaSvc.pointerOfResolvedNode(rootSchema, childNorm)
            : `${schemaPointer}/properties/${childKey}`;

          if (childNorm?.type === 'object' || childNorm?.properties) {
            const childDataPath = `${dataPath}/${childKey}`;
            const childNode = buildObjectNode(rootSchema, childKey, childPointer, childDataPath, childNorm, !!node.isActive, isPropRequired(rootSchema, objSchema, childKey));
            if (childNode) children[childKey] = childNode;
          } else if (childNorm?.type === 'array' && isArrayOfObjects(rootSchema, childNorm)) {
            const childDataPath = `${dataPath}/${childKey}`;
            const childNode = buildArrayNode(rootSchema, childKey, childPointer, childDataPath, childNorm, !!node.isActive, isPropRequired(rootSchema, objSchema, childKey));
            if (childNode) children[childKey] = childNode;
          }
        });

        if (Object.keys(children).length > 0) node.children = children;
      }

      return node;
    };

    const buildArrayNode = (rootSchema, key, schemaPointer, dataPath, arraySchema, parentActive, isRequired) => {
      const arrData = getDataAtPointer(data, dataPath);
      const length = Array.isArray(arrData) ? arrData.length : 0;
      const isActive = isRequired || length > 0;
      const activatable = !isRequired && length === 0 ? true : undefined;

      const node = {
        key,
        type: 'array',
        dataPath,
        schemaPointer,
        isRequired: !!isRequired,
        isActive: isActive ? true : undefined,
        activatable,
        items: undefined,
      };

      // eslint-disable-next-line no-console
      // try { console.log('[ui-model] array decision', { dataPath, key, isRequired: !!isRequired, parentActive: !!parentActive, length, isActive: !!node.isActive, activatable: !!node.activatable }); } catch { }

      if (isActive) {
        // For required arrays of objects with no data, seed a first empty item
        const shouldSeedFirstItem = isRequired && length === 0 && isArrayOfObjects(rootSchema, arraySchema);
        const effectiveLength = length > 0 ? length : (shouldSeedFirstItem ? 1 : 0);

        if (effectiveLength > 0) {
          const items = [];
          for (let i = 0; i < effectiveLength; i += 1) {
            const itemKey = String(i);
            const itemPointer = `${schemaPointer}/items`;
            const itemDataPath = `${dataPath}/${i}`;
            const child = buildObjectNode(
              rootSchema,
              itemKey,
              itemPointer,
              itemDataPath,
              deref(rootSchema, arraySchema.items) || arraySchema.items,
              true,
              true,
            );
            items.push(child);
          }
          if (items.length) node.items = items;
        }
      }
      return node;
    };

    // Root
    const rootNorm = normalize(schema, deref(schema, schema) || schema) || schema;
    const rootType = rootNorm?.type;
    const root = {
      key: '$root',
      type: rootType === 'array' ? 'array' : 'object',
      dataPath: '',
      schemaPointer: '#',
      isRequired: false,
      isActive: true,
    };

    if (root.type === 'object') {
      const { properties } = getPropertiesAndRequired(schema, rootNorm);
      const children = {};
      Object.entries(properties).forEach(([key, childSchema]) => {
        const childNorm = normalize(schema, deref(schema, childSchema) || childSchema) || childSchema;
        const childPointer = schemaSvc?.pointerOfResolvedNode
          ? schemaSvc.pointerOfResolvedNode(schema, childNorm)
          : `#/properties/${key}`;
        if (childNorm?.type === 'object' || childNorm?.properties) {
          children[key] = buildObjectNode(schema, key, childPointer, `/${key}`, childNorm, true, isPropRequired(schema, rootNorm, key));
        } else if (childNorm?.type === 'array' && isArrayOfObjects(schema, childNorm)) {
          children[key] = buildArrayNode(schema, key, childPointer, `/${key}`, childNorm, true, isPropRequired(schema, rootNorm, key));
        }
      });
      if (Object.keys(children).length) root.children = children;
    } else if (root.type === 'array') {
      const pointer = '#';
      const arrNode = buildArrayNode(schema, '$root', pointer, '', rootNorm, true, false);
      Object.assign(root, arrNode);
      root.key = '$root';
      root.isActive = arrNode.isActive || undefined;
      root.activatable = arrNode.activatable || undefined;
    }

    if (freeze && typeof Object.freeze === 'function') {
      const deepFreeze = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        Object.values(obj).forEach((v) => deepFreeze(v));
        return Object.freeze(obj);
      };
      return deepFreeze(root);
    }
    return root;
  }
}


