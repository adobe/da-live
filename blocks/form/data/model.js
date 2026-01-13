import { Validator } from '../../../deps/da-form/dist/index.js';
import { append } from '../utils/rfc6901-pointer.js';
import { resolveArrayItemsSchema } from '../utils/activation-helper.js';
import { SCHEMA_TYPES, DEFAULT_ITEM_TITLE } from '../constants.js';

/**
 * A data model that represents a form.
 * Uses a flat annotated structure with pre-indexed Maps for efficient lookups:
 * - primitiveNodes: Map<pointer, node> for O(1) lookup of primitive nodes
 * - groupNodes: Map<groupPointer, {node, children}> for O(1) lookup of groups and their children
 * All Maps reference the same node objects to save memory.
 */
export default class FormModel {
  constructor(json, schemas) {
    this._json = json;
    this._schema = schemas[this._json.metadata.schemaName];
    const annotated = FormModel.buildAnnotatedStructure(this._json.data, this._schema);
    this._primitiveNodes = annotated.primitiveNodes;
    this._groupNodes = annotated.groupNodes;
    this._emptyArray = [];
  }

  /** Resolve property schema, handling $ref references. */
  static resolvePropSchema(key, localSchema, fullSchema) {
    const { title } = localSchema;

    if (localSchema.$ref) {
      const path = localSchema.$ref.substring(2).split('/')[1];

      let def = localSchema.$defs?.[path];
      // NOTE: Nested $defs resolution not yet implemented.
      // Currently only resolves from localSchema.$defs or fullSchema.$defs.
      if (!def) def = fullSchema.$defs?.[path];
      if (def) {
        if (!title) return def;
        return { ...def, title };
      }
    }

    if (!title) return localSchema;
    return { ...localSchema, title };
  }

  /** Build annotated node with metadata from form data. */
  static annotateProp(
    key,
    propData,
    propSchema,
    fullSchema,
    parentPointer = '',
    context = {},
    flatArray = [],
  ) {
    const resolvedSchema = FormModel.resolvePropSchema(key, propSchema, fullSchema);
    const pointer = key === 'root' ? '' : parentPointer;
    const { groupPointer: parentGroupPointer = null, requiredSet = undefined } = context;
    const schemaType = resolvedSchema.type || resolvedSchema.properties?.type;

    if (Array.isArray(propData)) {
      const resolvedItemsSchema = FormModel.resolvePropSchema(key, propSchema.items, fullSchema);

      // Items may not have a title; let them inherit from the parent
      resolvedItemsSchema.title ??= resolvedSchema.title;

      const currentGroupPointer = pointer;

      const groupNode = {
        key,
        data: undefined,
        schema: resolvedSchema,
        pointer,
        groupPointer: parentGroupPointer,
        parentPointer: parentGroupPointer,
        type: 'array',
        isRequired: FormModel.isEffectivelyRequired(key, resolvedSchema, requiredSet),
      };
      flatArray.push(groupNode);
      propData.forEach((arrayItem, index) => {
        if (propSchema.items.oneOf) {
          // NOTE: oneOf schemas (discriminated unions) not yet supported.
          // Array items with oneOf will be skipped in current implementation.
        } else {
          const childPointer = append(pointer, String(index));
          const childContext = {
            groupPointer: currentGroupPointer,
            requiredSet: undefined, // Array items don't have required sets
          };

          FormModel.annotateProp(
            String(index),
            arrayItem,
            propSchema.items,
            fullSchema,
            childPointer,
            childContext,
            flatArray,
          );
        }
      });

      return groupNode;
    }

    // Guard against null being typeof 'object'
    if (propData && typeof propData === 'object') {
      const currentGroupPointer = pointer;
      const objectRequiredSet = schemaType === SCHEMA_TYPES.OBJECT
        ? new Set(resolvedSchema.required || [])
        : undefined;

      const groupNode = {
        key,
        data: undefined,
        schema: resolvedSchema,
        pointer,
        groupPointer: parentGroupPointer,
        parentPointer: parentGroupPointer,
        type: 'object',
        isRequired: FormModel.isEffectivelyRequired(key, resolvedSchema, requiredSet),
      };
      flatArray.push(groupNode);

      Object.entries(propData).forEach(([k, pD]) => {
        if (resolvedSchema.properties && resolvedSchema.properties[k]) {
          const childPointer = append(pointer, k);
          const childContext = {
            groupPointer: currentGroupPointer,
            requiredSet: objectRequiredSet,
          };
          FormModel.annotateProp(
            k,
            pD,
            resolvedSchema.properties[k],
            fullSchema,
            childPointer,
            childContext,
            flatArray,
          );
        }
      });

      return groupNode;
    }

    const fieldNode = {
      key,
      data: propData,
      schema: resolvedSchema,
      pointer,
      required: FormModel.isEffectivelyRequired(key, resolvedSchema, requiredSet),
      groupPointer: parentGroupPointer,
    };
    flatArray.push(fieldNode);
    return fieldNode;
  }

  /** Build flat annotated structure with pre-computed indexes for efficient lookups. */
  static buildAnnotatedStructure(jsonData, schema) {
    const flatArray = [];
    FormModel.annotateProp('root', jsonData, schema, schema, '', {
      groupPointer: null,
      requiredSet: undefined,
    }, flatArray);

    // Build indexes in a single pass - all reference the same node objects
    const primitiveNodes = new Map();
    const groupNodes = new Map();
    const childrenByParent = new Map(); // Temporary: collect children by parent

    flatArray.forEach((node) => {
      const isGroup = node.type === 'array' || node.type === 'object';

      if (isGroup) {
        if (!childrenByParent.has(node.pointer)) {
          childrenByParent.set(node.pointer, []);
        }
      } else {
        primitiveNodes.set(node.pointer, node);
      }

      const parent = node.groupPointer ?? null;
      if (!childrenByParent.has(parent)) {
        childrenByParent.set(parent, []);
      }
      childrenByParent.get(parent).push(node);
    });
    flatArray.forEach((node) => {
      const isGroup = node.type === 'array' || node.type === 'object';
      if (isGroup) {
        const children = childrenByParent.get(node.pointer) || [];

        if (node.type === 'array') {
          const maxItems = node.schema?.maxItems;
          let minItems = node.schema?.minItems || 0;

          // Enforce minimum of 1 for required arrays
          if (node.isRequired && minItems === 0) {
            minItems = 1;
          }

          const itemCount = children.length;
          const tempFormModel = { _schema: schema };
          const itemsSchema = resolveArrayItemsSchema(node, tempFormModel);
          const itemType = itemsSchema?.type;

          node.isEmpty = itemCount === 0;
          node.itemCount = itemCount;
          node.maxItems = maxItems;
          node.minItems = minItems;
          node.itemTitle = itemsSchema?.title || DEFAULT_ITEM_TITLE;
          node.isPrimitiveArray = itemType
            && itemType !== SCHEMA_TYPES.OBJECT
            && itemType !== SCHEMA_TYPES.ARRAY
            && !itemsSchema?.properties;

          // Check if array items are primitive arrays (arrays of primitives)
          // This is used to hide "+Add Item" in navigation for such arrays
          node.itemsArePrimitiveArrays = itemType === SCHEMA_TYPES.ARRAY
            && itemsSchema.items?.type
            && itemsSchema.items.type !== SCHEMA_TYPES.OBJECT
            && itemsSchema.items.type !== SCHEMA_TYPES.ARRAY;

          node.canAddMore = maxItems ? itemCount < maxItems : true;
          node.canRemoveItems = itemCount > minItems;
          node.isAtMaxItems = maxItems && itemCount >= maxItems;
          node.isAtMinItems = itemCount <= minItems;
        }

        groupNodes.set(node.pointer, { node, children });
      }
    });

    return { primitiveNodes, groupNodes };
  }

  /**
   * Determine if a field should show as "required" (with asterisk *) in the UI.
   * A field is effectively required when it must have a meaningful value, not just exist.
   *
   * @param {string} key - Field key
   * @param {Object} schema - Field's resolved schema
   * @param {Set} requiredSet - Parent's required fields set
   * @returns {boolean} - True if field should show asterisk
   */
  static isEffectivelyRequired(key, schema, requiredSet) {
    const isInRequiredArray = Boolean(requiredSet?.has?.(key));

    if (!isInRequiredArray) {
      return false;
    }

    const { type } = schema;

    // String fields: must have validation constraints to be effectively required
    if (type === SCHEMA_TYPES.STRING) {
      return Boolean(
        (schema.minLength && schema.minLength >= 1)
        || schema.pattern
        || schema.enum,
      );
    }

    // Number/integer fields: if required, show asterisk
    if (type === SCHEMA_TYPES.NUMBER || type === SCHEMA_TYPES.INTEGER) {
      return true;
    }

    // Boolean fields: checkboxes are optional by nature (false is valid)
    if (type === SCHEMA_TYPES.BOOLEAN) {
      return false;
    }

    // Array fields: required only if minItems >= 1
    if (type === SCHEMA_TYPES.ARRAY) {
      const minItems = schema.minItems || 0;
      return minItems >= 1;
    }

    // Object fields: if required, must exist (even if empty {})
    if (type === SCHEMA_TYPES.OBJECT) {
      return true;
    }

    // Fallback: use required array status
    return isInRequiredArray;
  }

  validate() {
    // shortCircuit: false - Report ALL validation errors, not just the first one
    const validator = new Validator(this._schema, '2020-12', false);
    const result = validator.validate(this._json.data);
    return result;
  }

  /** Get children of a group (O(1) lookup). */
  getChildren(parentPointer) {
    const key = parentPointer ?? null;
    const group = this._groupNodes.get(key);
    return group?.children || this._emptyArray || (this._emptyArray = []);
  }

  /** Get node by pointer (O(1) lookup). */
  getNode(pointer) {
    const primitive = this._primitiveNodes.get(pointer);
    if (primitive) return primitive;
    return this._groupNodes.get(pointer)?.node;
  }

  /** Check if pointer represents a field. */
  isField(pointer) {
    return this._primitiveNodes.has(pointer);
  }

  /** Get field node by pointer. */
  getField(pointer) {
    return this._primitiveNodes.get(pointer) || null;
  }

  /** Get group node by pointer. */
  getGroup(pointer) {
    return this._groupNodes.get(pointer)?.node || null;
  }

  /** Get all field nodes. */
  getFields() {
    return Array.from(this._primitiveNodes.values());
  }

  /** Get the root node. */
  get root() {
    return this._groupNodes.get('')?.node;
  }

  get json() {
    return this._json;
  }
}
