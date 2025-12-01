# FormModel Architecture Documentation

## Overview

`FormModel` is the core data structure for the form editor. It uses a **flat annotated structure** with pre-indexed Maps for efficient O(1) lookups, while maintaining the ability to reconstruct hierarchy on-demand via `groupPointer` relationships.

## JSON Structure

### Input JSON Format

```json
{
  "metadata": {
    "schemaName": "ffc-photoshop"
  },
  "data": {
    "buyURL": {
      "locReady": false,
      "name": "Example"
    },
    "targetType": "in-browser"
  }
}
```

### FormModel Internal Structure

```javascript
{
  _json: { metadata, data },           // Original JSON
  _schema: { ... },                     // Resolved schema object
  _nodeMap: Map<pointer, node>,        // O(1) lookup by pointer
  _childrenByParent: Map<parent, []>,   // O(1) children lookup
  _fields: Array<node>,                 // Pre-filtered field nodes
  _root: node                          // Root node (pointer === '')
}
```

## Node Structure

Each node in the flat array contains:

### Field Node (Primitive)
```javascript
{
  key: "targetType",                    // Property key
  data: "in-browser",                   // Actual value from JSON
  schema: { type: "string", ... },      // Resolved schema
  pointer: "/targetType",               // RFC 6901 pointer
  required: false,                      // Computed from parent's required array
  groupPointer: "/buyURL"               // Parent group pointer (null for root children)
}
```

### Group Node (Object/Array)
```javascript
{
  key: "buyURL",
  data: undefined,                     // Groups don't have primitive values
  schema: { type: "object", ... },      // Resolved schema
  pointer: "/buyURL",
  groupPointer: null,                   // Parent group (null for root)
  parentPointer: null,                  // Same as groupPointer
  type: "object"                        // "object" or "array"
}
```

## Construction Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    FormModel Construction                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────┐
        │  new FormModel(json, schemas)      │
        └─────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────┐
        │  buildAnnotatedStructure()           │
        │  - Creates flat array of nodes      │
        │  - Computes metadata (required, etc) │
        └─────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────┐
        │  Build Indexes (Single Pass)        │
        │  ┌───────────────────────────────┐ │
        │  │ nodeMap: Map<pointer, node>   │ │
        │  │ childrenByParent: Map<parent> │ │
        │  │ fields: Array<fieldNode>      │ │
        │  │ root: node                    │ │
        │  └───────────────────────────────┘ │
        └─────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────┐
        │  FormModel Instance Ready            │
        │  - All lookups O(1)                 │
        │  - Hierarchy via getChildren()       │
        └─────────────────────────────────────┘
```

## Data Flow Diagram

```
┌──────────────┐
│   JSON Data  │
│  + Schema    │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│              FormModel.buildAnnotatedStructure()         │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ annotateProp() - Recursive traversal              │ │
│  │  - Resolves schema ($ref handling)                 │ │
│  │  - Computes metadata (required, groupPointer)       │ │
│  │  - Creates nodes (field or group)                  │ │
│  │  - Adds to flatArray                               │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Index Building (Single Pass)                       │ │
│  │  forEach node in flatArray:                        │ │
│  │    nodeMap.set(node.pointer, node)                 │ │
│  │    childrenByParent.get(parent).push(node)          │ │
│  │    if (isField) fields.push(node)                  │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│                    FormModel Instance                     │
│                                                          │
│  Private:                                                 │
│    _nodeMap: Map<"/targetType", fieldNode>               │
│    _childrenByParent: Map<null, [root, ...]>             │
│    _fields: [fieldNode1, fieldNode2, ...]                │
│    _root: rootNode                                        │
│                                                          │
│  Public API:                                              │
│    getChildren(parentPointer) → Array<node>              │
│    getNode(pointer) → node | undefined                   │
│    getField(pointer) → fieldNode | null                   │
│    getGroup(pointer) → groupNode | null                   │
│    getFields() → Array<fieldNode>                        │
│    isField(pointer) → boolean                             │
│    root → rootNode                                        │
│    json → original JSON                                   │
│    validate() → validation result                         │
└──────────────────────────────────────────────────────────┘
```

## Consumption Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Component Usage                           │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  FormEditor  │    │   Sidebar    │    │ Validation   │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                    │                    │
       │                    │                    │
       ▼                    ▼                    ▼
┌──────────────────────────────────────────────────────────┐
│                    FormModel API Usage                    │
│                                                          │
│  FormEditor:                                              │
│    formModel.root              → Get root for rendering │
│    formModel.getChildren(ptr)  → Render children        │
│                                                          │
│  Sidebar:                                                 │
│    formModel.root              → Navigation tree         │
│    formModel.getChildren(ptr)  → Build nav items         │
│                                                          │
│  Validation:                                               │
│    formModel.getFields()       → Check all fields        │
│    formModel.getField(ptr)     → Get field metadata      │
│    formModel.isField(ptr)      → Filter errors           │
│                                                          │
│  Breadcrumb:                                               │
│    formModel.getNode(ptr)      → Navigate path           │
│                                                          │
│  Preview:                                                  │
│    formModel.json              → Display JSON            │
└──────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. **Flat Structure vs Hierarchical**

**Why Flat?**
- O(1) lookups by pointer (`nodeMap`)
- O(1) children lookup (`childrenByParent`)
- Pre-filtered fields array (no need to traverse)
- Single source of truth

**Why Not Just Hierarchical?**
- Would require traversal for lookups (O(n))
- Harder to filter fields vs groups
- More complex to maintain

### 2. **Pre-computed Indexes**

All indexes are built **once** during construction:
- `nodeMap`: For direct pointer lookups
- `childrenByParent`: For hierarchy reconstruction
- `fields`: Pre-filtered array (no runtime filtering)

**Performance**: O(n) construction, O(1) lookups

### 3. **Metadata in Nodes**

Metadata is computed during annotation:
- `required`: From parent's `required` array
- `groupPointer`: Parent group (for hierarchy)
- `pointer`: RFC 6901 pointer (for validation)

**Why?** Avoids runtime computation, improves performance

### 4. **Stable Array References**

Methods return **stable references**:
- `getChildren()` returns same array reference if called multiple times
- `getFields()` returns pre-computed array
- Prevents unnecessary re-renders in Lit components

## Usage Examples

### Rendering Form Fields

```javascript
// In FormEditor component
renderList(parent) {
  const children = this.formModel.getChildren(parent.pointer);
  
  return html`
    ${children.map(child => {
      if (child.type === 'object' || child.type === 'array') {
        // Render group
        return this.renderGroup(child);
      } else {
        // Render field
        return this.renderField(child);
      }
    })}
  `;
}
```

### Validation

```javascript
// In ValidationState
formModel.getFields().forEach(fieldNode => {
  if (fieldNode.required && isEmpty(value)) {
    // Add required error
  }
});

// Filter errors
const isFieldError = formModel.isField(errorPointer);
```

### Navigation

```javascript
// In Breadcrumb
const node = formModel.getNode(pointer);
const parent = formModel.getNode(node.groupPointer);
```

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| Construction | O(n) | Single pass through data |
| `getNode(pointer)` | O(1) | Map lookup |
| `getChildren(parent)` | O(1) | Map lookup + array reference |
| `getFields()` | O(1) | Pre-computed array |
| `isField(pointer)` | O(1) | Map lookup + type check |
| Hierarchy traversal | O(depth) | Via `getChildren()` calls |

Where:
- `n` = total number of nodes (fields + groups)
- `depth` = maximum nesting depth

## Memory Characteristics

- **One node object per field/group**: O(n) memory
- **Maps for indexes**: O(n) memory
- **Pre-computed arrays**: O(n) memory
- **Total**: O(n) - linear with form size

## Reactivity Model

### Data Changes

```
User edits field
    ↓
commitValue(pointer, value)
    ↓
dispatchEvent('form-model-intent', { op: 'replace', path, value })
    ↓
form.js: handleModelIntent()
    ↓
applyOp(json, op) → new JSON
    ↓
new FormModel(newJson, schemas)
    ↓
New node objects created (with updated data values)
    ↓
Lit detects formModel property change
    ↓
Components re-render with new node.data values
```

### Key Points

1. **New FormModel instance** on every data change
2. **New node objects** created (with updated `data` property)
3. **Stable references** for arrays (`getChildren()`, `getFields()`)
4. **Lit reactivity** detects `formModel` property change
5. **Templates** use `node.data` → Lit detects value changes

## API Reference

### Constructor
```javascript
new FormModel(json, schemas)
```
- `json`: Form JSON with `metadata` and `data`
- `schemas`: Object mapping schema names to schema objects

### Public Methods

#### `getChildren(parentPointer): Array<node>`
Returns children of a parent. Uses pre-indexed `childrenByParent` Map.
- **Complexity**: O(1)
- **Returns**: Stable array reference

#### `getNode(pointer): node | undefined`
Gets a node by its RFC 6901 pointer.
- **Complexity**: O(1)
- **Returns**: Node object or undefined

#### `getField(pointer): fieldNode | null`
Gets a field node (non-group).
- **Complexity**: O(1)
- **Returns**: Field node or null

#### `getGroup(pointer): groupNode | null`
Gets a group node (object/array).
- **Complexity**: O(1)
- **Returns**: Group node or null

#### `getFields(): Array<fieldNode>`
Returns all field nodes (pre-filtered).
- **Complexity**: O(1)
- **Returns**: Stable array reference

#### `isField(pointer): boolean`
Checks if a pointer refers to a field.
- **Complexity**: O(1)
- **Returns**: true if field, false if group or not found

#### `validate(): ValidationResult`
Validates the form data against the schema.
- **Returns**: Validation result object

### Public Properties

#### `root: node`
The root node (pointer === '').

#### `json: object`
The original JSON data (for preview, etc.).

## Summary

FormModel provides:
- ✅ **O(1) lookups** via pre-indexed Maps
- ✅ **Flat structure** for efficient access
- ✅ **Hierarchy reconstruction** via `getChildren()`
- ✅ **Pre-computed metadata** (required, groupPointer)
- ✅ **Stable references** for Lit reactivity
- ✅ **Single source of truth** for form structure

This design balances performance (O(1) lookups) with flexibility (hierarchy reconstruction) while maintaining clean separation between data structure and rendering logic.

