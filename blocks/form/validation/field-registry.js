// Builds a lookup structure for fields and groups based on the annotated form model.

function createEmptyRegistry() {
  const emptyMap = new Map();
  return {
    fields: [],
    fieldMap: emptyMap,
    groupMap: emptyMap,
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTitle(node) {
  return node?.schema?.title || node?.key || '';
}

export default function buildFieldRegistry(rootAnnotated) {
  if (!rootAnnotated) {
    return createEmptyRegistry();
  }

  const fields = [];
  const fieldMap = new Map();
  const groupMap = new Map();

  const visit = (node, context = {}) => {
    if (!node) return;
    const pointer = node.pointer ?? '';
    const nodeSchema = node.schema || {};
    const schemaProperties = nodeSchema.properties || {};
    const schemaType = nodeSchema.type || schemaProperties.type;
    const isGroup = Array.isArray(node.data);

    const parentGroupPointer = context.groupPointer ?? null;

    if (!isGroup) {
      const meta = {
        pointer,
        label: normalizeTitle(node),
        key: node.key,
        schema: nodeSchema,
        required: Boolean(context.requiredSet?.has?.(node.key)),
        groupPointer: parentGroupPointer,
      };
      fields.push(meta);
      fieldMap.set(pointer, meta);
      return;
    }

    // Treat any node with children as a group (objects, array entries, root, etc.).
    const groupMeta = {
      pointer,
      label: normalizeTitle(node),
      key: node.key,
      schema: nodeSchema,
      parentPointer: parentGroupPointer,
      type: schemaType || (nodeSchema.items ? 'array' : 'object'),
    };
    groupMap.set(pointer, groupMeta);

    const nextContext = {
      groupPointer: pointer,
      requiredSet: schemaType === 'object' ? new Set(nodeSchema.required || []) : undefined,
    };

    asArray(node.data).forEach((child) => visit(child, nextContext));
  };

  visit(rootAnnotated, { groupPointer: null, requiredSet: undefined });

  return { fields, fieldMap, groupMap };
}

export { createEmptyRegistry };

