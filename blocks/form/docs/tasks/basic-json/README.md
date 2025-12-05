## Basic JSON generation on schema selection

### Overview
- When a user selects a schema, the form editor boots with a minimal JSON payload built from that schema.
- This avoids unwanted pre-filled values and gives the user a clean structure to start from.
- Existing schema loading is reused (`schemasPromise`, `getSchema`), no changes to fetch/caching.

### Resulting JSON shape
```json
{
  "metadata": { "schemaName": "<selected-schema-id>" },
  "data": { /* minimal values per rules below */ }
}
```

### Generation rules (conservative/minimal)
- Prefer `const` (highest) or `default` if present in schema.
- Otherwise use minimal empties:
  - strings: `""`
  - numbers/integers: `null`
  - booleans: `null`
  - nulls: `null`
- Objects:
  - Include all properties (required and optional).
  - Optional non-array properties use their minimal empty values per type (e.g. `""`, `null`).
  - Optional array properties are included as empty arrays (`[]`).
- Arrays:
  - If the array property is optional: `[]`.
  - If the array property is required: a single item is created recursively.
  - For `items.oneOf`, choose the first variant deterministically.
- `$ref` resolution:
  - Resolve local refs of form `#/$defs/...` against the current schema’s `$defs`.

### Implementation wiring
- `blocks/form/utils/data-generator.js`
  - Exports `generateMinimalDataForSchema(schema)`.
  - Handles `$ref`, `const/default`, `enum`, required vs optional properties, and array rules.
- `blocks/form/form.js`
  - `handleSelectSchema` reads the `schemaId`, loads schema using existing cache/fallback, then:
    - `data = generateMinimalDataForSchema(schema)`
    - `json = { metadata: { schemaName: schemaId }, data }`
    - `this.formModel = new FormModel(json, this._schemas)`

### Algorithm outline (pseudocode)
```js
function generateMinimalDataForSchema(schema) {
  const root = normalizeRoot(schema);
  return generateForNode(root, schema, new Set());
}

function generateForNode(node, fullSchema, requiredSet) {
  if (node.$ref) return generateForNode(deref(node.$ref, fullSchema), fullSchema, requiredSet);
  if (node.const !== undefined) return clone(node.const);
  if (node.default !== undefined) return clone(node.default);
  if (node.enum) return node.default ?? (node.type === 'string' ? '' : null);

  if (node.type === 'array' || node.items) {
    const items = node.items?.oneOf ? node.items.oneOf[0] : node.items;
    return requiredSet.has(node._propName) ? [generateForNode(items, fullSchema, new Set())] : [];
  }

  if (node.type === 'object' || node.properties) {
    const out = {};
    const required = new Set(node.required || []);
    for (const [k, v] of Object.entries(node.properties || node)) {
      const child = tagWithPropName(normalizePropSchema(k, v, fullSchema), k);
      const value = generateForNode(child, fullSchema, required);
      out[k] = value; // include all properties
    }
    return out;
  }

  // primitives
  return node.type === 'string' ? '' : null;
}
```

### Out of scope (for now)
- Respecting `minItems > 1` (can be added behind an option).
- Using a faker-based generator (can be added as an alternative mode).

### QA checklist
- Selecting any schema boots the editor with a minimal structure (no random values).
- Required arrays have exactly one item; optional arrays are `[]`.
- All object properties are present; optional scalars use minimal empty values.
- `$ref`-based structures are resolved correctly.


