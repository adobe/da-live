### FormUiModel Service

A precise, implementation-oriented specification of a service that derives a normalized, precomputed UI model from JSON Schema + JSON data. Both the form UI and the navigation render from this one source of truth to stay perfectly in sync.

See also: `ui-flow.md`, `navigation.md`.

Terminology note: In code and services this is referred to as the “Form UI Model”.

---

## Objectives

- **Single source of truth**: Form UI and Navigation consume the same derived model; neither re-derives it.
- **Deterministic activation**: Optional objects and arrays-of-objects are hidden until activated (or data exists); required arrays are always active.
- **Predictable defaults**: When no data exists, defaults are synthesized from the schema (notably: optional arrays default to `[]`).
- **Stable structure**: The derived tree mirrors the schema hierarchy (objects and arrays-of-objects only) and records where each group lives in the data via JSON Pointer.

---

## Scope and Non-Goals

- **In scope**: Groups (objects, arrays whose items resolve to objects), activation state, required flags at group keys, data paths, basic trace metadata.
- **Out of scope**: Field-level enumeration (primitives and arrays-of-primitives). Validation logic. UI layout details. Mutation APIs. Persistence.

Rendering of primitive fields (including arrays-of-primitives) is handled directly from schema + data by the UI layer. The FormUiModel exposes a `hasPrimitives` hint at group level only.

---

## Glossary

- **Group**: A schema node that is either an object or an array whose `items` resolves to an object (array-of-objects).
- **Activation**: Visibility/availability semantics for groups. Optional objects and arrays-of-objects can be activatable when no data exists.
- **Activatable**: Present on optional groups that are currently inactive (e.g., optional arrays with `[]`, optional objects with no value present).
- **JSON Pointer**: RFC 6901 path into the current data, e.g., `/profile/phones/0`.

---

## Data Model

### Full node shape

```js
/**
 * Supported JSON Schema features: Draft-07/2019-09/2020-12 subsets used here
 * - type, properties, items, required, $defs/definitions, $ref
 */

/** @typedef {'object'|'array'} FormUiModelNodeType */

/**
 * @typedef {Object} FormUiModelNode
 * @property {string} key                         property name or array index (string). '$root' at the root
 * @property {FormUiModelNodeType} type             'object' | 'array' (array = array-of-objects)
 * @property {string} dataPath                    JSON Pointer into data, e.g. '/profile/phones/0'
 * @property {string} schemaPointer               JSON Pointer into the resolved schema node
 * @property {string=} originalRef                original $ref value if this node originated from a $ref
 * @property {boolean} isRequired                 whether the property (or array) is required at its parent
 * @property {true=} isActive                     present only when active (arrays: required or data.length > 0)
 * @property {boolean=} activatable               present only for optional arrays that are currently empty/inactive
 * @property {boolean=} hasPrimitives             this group contains primitive fields or arrays-of-primitives
 * @property {Object<string, FormUiModelNode>=} children   for objects: map of group-children
 * @property {FormUiModelNode[]=} items             for arrays: one node per existing item (0..n)
 */

/** @typedef {FormUiModelNode} FormUiModel */
```

### Core (lean) node shape for rendering

```js
/** @typedef {'object'|'array'} CoreType */

/**
 * @typedef {Object} CoreNode
 * @property {string} key
 * @property {CoreType} type
 * @property {string} dataPath
 * @property {boolean} isRequired
 * @property {true=} isActive
 * @property {boolean=} activatable
 * @property {Object<string, CoreNode>=} children
 * @property {CoreNode[]=} items
 * @property {boolean=} hasPrimitives
 * @property {{ schemaPointer?: string, originalRef?: string }=} meta
 */
```

The core shape uses the same field names as the full shape, with an optional `meta` object to carry trace data.

---

## API Contract

```js
/**
 * Build a derived FormUiModel from schema + current data (read‑only groups tree).
 * Accessed via the injected service container in the app:
 *   services.formUiModel.createFormUiModel({ schema, data }, { freeze })
 * @param {{ schema: any, data?: any }} input
 * @param {{ freeze?: boolean }} [options]
 * @returns {FormUiModel}
 */
function createFormUiModel(input, options) {}
```

Invariants:

- The root node has `key: '$root'`, `type: 'object' | 'array'`, `dataPath: ''`, and `isActive: true`.
- `isActive` appears only when `true`. `activatable` appears only when `true`.
- Optional objects may carry `activatable: true` when no data is present; they become `isActive: true` once data exists or when required.
- `items.length` equals the number of existing array entries in data for active arrays. For required arrays-of-objects with no data, a single item is exposed in the model to enable immediate traversal.

---

## Activation Semantics

- **Required array-of-objects**: Always active, even when data is `[]` (`isActive: true`). When empty, the model exposes a single item entry so navigation/content can recurse immediately.
- **Optional array-of-objects**:
  - If `data.length > 0`: `isActive: true`.
  - If `data.length === 0`: `activatable: true` and the node is not rendered in the form UI (nav may offer activation control for arrays).
- **Objects**: If parent is active and the object is required or data exists at its path → `isActive: true`; otherwise `activatable: true` (optional objects without data).

Defaults must ensure optional arrays initialize to `[]` so they become `activatable` (not `isActive`).

---

## Defaulting Rules (data synthesis)

When `data` is not provided, synthesize defaults from the schema:

- Objects: default to an object with defaults for children (recursively), omitting properties that cannot be inferred unless required.
- Arrays-of-objects: default to `[]` unless required-by-parent rules dictate otherwise. Required arrays are still `[]` but considered active.
- Primitives and arrays-of-primitives: left to the UI. However, the group’s `hasPrimitives` flag is computed so UI knows to render fields inside the active group.

Note: The exact primitive defaulting strategy is intentionally left to the UI/field layer; the FormUiModel only guarantees group structure and activation flags.

---

## Reference Resolution ($ref)

Before interpreting type/properties/items/required, resolve `$ref` chains into a concrete schema node. Maintain:

- `schemaPointer`: JSON Pointer to the resolved node in the fully-dereferenced view.
- `originalRef`: the original `$ref` value if used.

Cycles must be guarded via a visited-set.

---

## Processing Algorithm (high-level)

```mermaid
flowchart TD
  A[createFormUiModel(input)] --> B[Dereference root schema]
  B --> C[Ensure data defaults]
  C --> D{schema.type}
  D -->|object| E[Build object group]
  E --> F[Mark active (via ancestors)]
  F --> G[For each property]
  G --> H[Dereference]
  H --> I{array-of-objects?}
  I -->|yes| J[Compute required]
  J --> K[Ensure [] default]
  K --> L[Set isActive or activatable]
  L --> M[Create items for each index]
  I -->|no| N{object?}
  N -->|yes| O[Recurse object group]
  N -->|no| P[Mark parent.hasPrimitives]
  D -->|array| Q[Build array group]
  Q --> R[Compute required]
  R --> S[Ensure [] default]
  S --> T[Set isActive or activatable]
  T --> U[Create items for each index]
```

Root arrays: If the root schema is an `array`, treat the root as a group with `isRequired: false` unless otherwise specified by a wrapper. An empty root array is `activatable: true`; the UI should offer a first activation that creates one initial item.

---

## Minimal Walkthrough

Schema:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "title": { "type": "string" },
    "tags": { "type": "array", "items": { "type": "string" } }
  }
}
```

Synthesized defaults:
```json
{ "title": "", "tags": [] }
```

Core model:
```json
{
  "key": "$root",
  "type": "object",
  "dataPath": "",
  "isRequired": false,
  "isActive": true,
  "hasPrimitives": true,
  "children": {}
}
```

---

## Comprehensive Example

Schema:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "recipe-of-the-day": { "title": "Recipe of the day", "type": "string" },
    "related": { "type": "array", "items": { "type": "string" } },
    "chefs": { "type": "array", "items": { "type": "object", "properties": { "name": { "type": "string" } } } },
    "recipes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "title": { "type": "string" },
          "ingredients": { "type": "array", "items": { "type": "object", "properties": { "name": { "type": "string" } } } },
          "reviews": { "type": "array", "items": { "type": "object", "properties": { "date": { "type": "string" }, "score": { "type": "string" } } } }
        },
        "required": ["ingredients"]
      }
    }
  },
  "required": ["recipes"]
}
```

Synthesized defaults:
```json
{ "recipe-of-the-day": "", "related": [], "chefs": [], "recipes": [] }
```

Derived groups-only model:
```json
{
  "key": "$root",
  "type": "object",
  "dataPath": "",
  "isActive": true,
  "hasPrimitives": true,
  "children": {
    "chefs": {
      "key": "chefs",
      "type": "array",
      "dataPath": "/chefs",
      "isRequired": false,
      "activatable": true,
      "items": []
    },
    "recipes": {
      "key": "recipes",
      "type": "array",
      "dataPath": "/recipes",
      "isRequired": true,
      "isActive": true,
      "items": [],
      "itemTemplate": {
        "ingredients": { "key": "ingredients", "type": "array", "isRequired": true, "isActive": true },
        "reviews": { "key": "reviews", "type": "array", "isRequired": false, "activatable": true }
      }
    }
  }
}
```

---

## Integration Guidance

- **Navigation**: Render directly from the FormUiModel root. For arrays with `activatable`, render an explicit "Activate" affordance. For arrays with `isActive`, render items and an Add control. Removal is not provided in navigation.
- **Form UI**: Render only nodes with `isActive`. Optional objects can be activated in the content (or by presence of data); arrays expose Add/Remove/Reorder. Required flags inform validation but not visibility, except for arrays as specified above.
- **Update flow**: Treat the FormUiModel as read-only. When user actions occur (activate an array, add/remove items), mutate the data accordingly, then recompute the FormUiModel and rerender.

---

## Invariants and Edge Cases

- Optional objects and arrays-of-objects are the visibility gates.
- Required arrays can be empty and still active; the model exposes a single first item in that empty state.
- Optional arrays keep `activatable` until they contain at least one item.
- Root array schemas are supported; an empty root array results in an `activatable` root with a single initial activation afforded by the UI.
- `$ref` cycles must be prevented; resolved shapes must be used for type decisions.

---

## Performance and Recomputation

- The service is pure: given `(schema, data)` it returns a new tree without side effects.
- Consumers should recompute after meaningful data changes (activation, add/remove item). Incremental updates are optional optimizations but not required by this contract.
- The structure is stable; node `dataPath` and `schemaPointer` enable targeted updates if implemented.

---

## Testing Checklist

- Optional array remains `activatable: true` when empty; becomes `isActive: true` after adding first item.
- Required array is `isActive: true` for both `[]` and non-empty arrays; when empty, model includes a first item for traversal.
- Optional objects without data expose `activatable: true`; they become `isActive: true` when data is present or if required.
- `hasPrimitives` is set when an object group contains at least one primitive or array-of-primitives field at any depth directly under that group.
- `$ref`-based schemas produce identical results to inlined schemas.
- Root array behaves as specified (including activation affordance at empty state).

---

## Future Extensions (non-binding)

- Optional `itemTemplate` metadata for arrays-of-objects to hint default item structure for activation.
- Pluggable primitive defaulting strategies to aid field rendering.
- Incremental diff API that returns only the affected subtree for common mutations.

---

## Summary

The FormUiModel service centralizes and standardizes interpretation of schema + data into a deterministic, read-only groups tree with clear activation semantics. Arrays-of-objects are the only visibility gates, optional arrays are hidden until activated, and required arrays are always visible. Using this single, precomputed model keeps the form UI and navigation consistent and greatly simplifies implementation.


