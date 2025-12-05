/* eslint-disable no-console */
import { Validator } from '../../../deps/da-form/dist/index.js';
import { append } from '../utils/rfc6901-pointer.js';

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
    // Build flat annotated structure with essential indexes pre-computed
    const annotated = FormModel.buildAnnotatedStructure(this._json.data, this._schema);
    this._primitiveNodes = annotated.primitiveNodes;
    this._groupNodes = annotated.groupNodes;
    // Cache primitive nodes array for stable reference (prevents unnecessary re-renders)
    this._primitiveNodesArray = Array.from(annotated.primitiveNodes.values());
    this._emptyArray = []; // Stable empty array reference
  }

  /** Resolve property schema, handling $ref references. */
  static resolvePropSchema(key, localSchema, fullSchema) {
    const { title } = localSchema;

    if (localSchema.$ref) {
      const path = localSchema.$ref.substring(2).split('/')[1];

      // try local ref
      let def = localSchema.$defs?.[path];
      // TODO: walk up the tree looking for the def
      // try global ref
      if (!def) def = fullSchema.$defs?.[path];
      if (def) {
        if (!title) return def;
        return { ...def, title };
      }
    }

    // Normalize local props to the same format as referenced schema
    return { title, properties: localSchema };
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
    // Will have schema.props
    const resolvedSchema = FormModel.resolvePropSchema(key, propSchema, fullSchema);
    const pointer = key === 'root' ? '' : parentPointer;
    const { groupPointer: parentGroupPointer = null, requiredSet = undefined } = context;
    const schemaType = resolvedSchema.type || resolvedSchema.properties?.type;

    if (Array.isArray(propData)) {
      const resolvedItemsSchema = FormModel.resolvePropSchema(key, propSchema.items, fullSchema);

      // Items may not have a title; let them inherit from the parent
      resolvedItemsSchema.title ??= resolvedSchema.title;

      const currentGroupPointer = pointer;

      // Create the array group node (no data value, just metadata)
      const groupNode = {
        key,
        data: undefined, // Groups don't have primitive data values
        schema: resolvedSchema,
        pointer,
        groupPointer: parentGroupPointer,
        parentPointer: parentGroupPointer,
        type: 'array',
      };
      flatArray.push(groupNode);

      // Process children and add them to flatArray
      propData.forEach((itemPropData, index) => {
        if (propSchema.items.oneOf) {
          // TODO: Support one of schemas
          // propSchema.items.oneOf.forEach((oneOf) => {
          //   const ctx = { groupPointer: currentGroupPointer, requiredSet: undefined };
          //   const childPtr = `${pointer}/${index}`;
          //   FormModel.annotateProp(
          //     key, itemPropData, oneOf, fullSchema, childPtr, ctx, flatArray);
          // });
        } else {
          const childPointer = append(pointer, String(index));
          const childContext = {
            groupPointer: currentGroupPointer,
            requiredSet: undefined, // Array items don't have required sets
          };
          FormModel.annotateProp(
            key,
            itemPropData,
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
      // This is an object group
      const currentGroupPointer = pointer;
      const objectRequiredSet = schemaType === 'object'
        ? new Set(resolvedSchema.required || [])
        : undefined;

      // Create the object group node (no data value, just metadata)
      const groupNode = {
        key,
        data: undefined, // Groups don't have primitive data values
        schema: resolvedSchema,
        pointer,
        groupPointer: parentGroupPointer,
        parentPointer: parentGroupPointer,
        type: 'object',
      };
      flatArray.push(groupNode);

      // Process children and add them to flatArray
      Object.entries(propData).forEach(([k, pD]) => {
        if (resolvedSchema.properties[k]) {
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

    // Primitive field (not a group) - has actual data value
    const fieldNode = {
      key,
      data: propData,
      schema: resolvedSchema,
      pointer,
      required: Boolean(requiredSet?.has?.(key)),
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

    // First pass: separate primitives from groups and collect children
    flatArray.forEach((node) => {
      const isGroup = node.type === 'array' || node.type === 'object';

      if (isGroup) {
        // Group node - will be stored in groupNodes with its children
        // Initialize children array for this group
        if (!childrenByParent.has(node.pointer)) {
          childrenByParent.set(node.pointer, []);
        }
      } else {
        // Primitive node - store in primitiveNodes
        primitiveNodes.set(node.pointer, node);
      }

      // Collect children by parent (for building groupNodes)
      const parent = node.groupPointer ?? null;
      if (!childrenByParent.has(parent)) {
        childrenByParent.set(parent, []);
      }
      childrenByParent.get(parent).push(node);
    });

    // Second pass: build groupNodes with their children
    flatArray.forEach((node) => {
      const isGroup = node.type === 'array' || node.type === 'object';
      if (isGroup) {
        const children = childrenByParent.get(node.pointer) || [];
        groupNodes.set(node.pointer, {
          node, // Reference to the same node object from flatArray
          children, // Array of child nodes (same references from flatArray)
        });
      }
    });

    return { primitiveNodes, groupNodes };
  }

  validate() {
    const validator = new Validator(this._schema, '2020-12');
    const result = validator.validate(this._json.data);
    return result;
  }

  /** Get children of a group (O(1) lookup). Returns stable array reference. */
  getChildren(parentPointer) {
    const key = parentPointer ?? null;
    const group = this._groupNodes.get(key);
    // Return stable empty array if no children found (prevents unnecessary re-renders)
    return group?.children || this._emptyArray || (this._emptyArray = []);
  }

  /** Get node by pointer (O(1) lookup). */
  getNode(pointer) {
    // Check primitive nodes first (more common)
    const primitive = this._primitiveNodes.get(pointer);
    if (primitive) return primitive;
    // Check group nodes
    return this._groupNodes.get(pointer)?.node;
  }

  /** Check if pointer represents a field (not a group). */
  isField(pointer) {
    return this._primitiveNodes.has(pointer);
  }

  /** Get field node by pointer (null if not a field). */
  getField(pointer) {
    return this._primitiveNodes.get(pointer) || null;
  }

  /** Get group node by pointer (null if not a group). */
  getGroup(pointer) {
    return this._groupNodes.get(pointer)?.node || null;
  }

  /** Get all field nodes. Returns stable array reference. */
  getFields() {
    return this._primitiveNodesArray;
  }

  /** Get the root node. */
  get root() {
    return this._groupNodes.get('')?.node;
  }

  get json() {
    return this._json;
  }
}
