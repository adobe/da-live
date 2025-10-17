# Form UI Navigation: Model‑Driven Generation – Detailed Flow

This document explains how the sidebar navigation is generated from the read‑only FormUiModel tree (derived from `(schema, data)`), keeping it perfectly in sync with content built by `GroupBuilder`. The previous schema+data traversal (`generateNavigationItems`) has been replaced by a model‑driven builder.

## Goals and guarantees

- Navigation is model driven using the Form UI Model produced by `services.formUiModel.createFormUiModel({ schema, data })`. No DOM counting is used to build the tree.
- Every group/section you see in the content area exists in navigation with the same structure and order.
- Exactly one navigation node is emitted per object node at a given path:
  - If the object contains primitives at this level → a single “group” item is emitted.
  - If the object has NO primitives but has child properties → a single “section title” item is emitted, then children are recursed.
- Arrays of objects are first‑class:
  - The array itself gets a group entry.
  - Existing array items get individual child entries.
  - Each array item is then recursed into (depth‑first) using its item schema, so grandchildren appear correctly beneath the item.

## Inputs and helpers

- `modelNode`: current node from the FormUiModel (root or any child).
- `level`: indentation level used for CSS variables and nested list construction.
- Primary builders:
- `features/navigation/builders/model-to-flat.buildFlatNavFormUiModel(formGenerator, modelNode, level)` → HTMLElement[]
- `features/navigation/builders/nested-list.buildNestedList(nodes)` → nested UL/LI tree
- Helpers:
  - `pointerToInputName(pointer)` to convert JSON Pointer from model (`node.dataPath`) into dotted path used for IDs and labels
  - `formGenerator.pathToGroupId(path)`, `formGenerator.arrayItemId(path, index)` – stable DOM IDs
  - Schema titles resolved via SchemaService at `node.schemaPointer`

## High‑level algorithm (depth‑first over FormUiModel)

1) Inspect `modelNode.type`. If neither `object` nor `array`, return empty list.

2) Determine if this level has primitives:
   - Resolve the schema at `node.schemaPointer` using SchemaService and compute `hasPrimitivesAtThisLevel` via `formGenerator.hasPrimitiveFields()`.
   - If true and the level is not the artificial root, emit a single “group item” for this level (root handled by shell).

3) Recurse via the model (no DOM/data counting):
   - Object nodes: iterate `node.children` in schema order; emit GROUP or SECTION once, then recurse if it has children.
   - Array nodes: always emit the array GROUP at the array path. If `node.activatable` is present, emit a single Add control and stop. If `node.isActive` and `node.items` are present, emit an entry per item using `arrayItemId`, then recurse into each item object node with `suppressSelf`.

4) Arrays of objects (details):
   - Add control label resolves via item schema title; element carries `data-array-path` for delegated click handler.

5) Objects (details):
   - Exactly one node per object level (GROUP if primitives exist at that level, otherwise SECTION if it has children). Then recurse to children if present.

This “one node per object” rule is what prevents duplicates like emitting both a group item and a section title for the same object.

## Level and metadata

- Each emitted nav node carries `dataset.level` used by the nested list builder to place it in the correct UL/LI depth.
- Arrays set `dataset.arrayPath` and item nodes set `dataset.itemIndex` and are made draggable.
- Group nodes store `data-group-id` tied to the content’s DOM group id so clicking the nav can scroll to the correct group.

## Special considerations

- `$ref` and `oneOf`: resolved by SchemaService when computing titles and `hasPrimitives` at the node’s `schemaPointer`.
- Optional gating: driven by the FormUiModel. Optional arrays expose `activatable` until they contain at least one item; required arrays are always `isActive: true`.
- Sticky parents: when `context.config.navigation.stickyParents` is true, parent path highlighting is enabled in the tree for better context.
- Root handling: the artificial root emits only its children; the root group itself is not duplicated as a separate nav item beyond the shell header.

## Building the nested tree from the flat list

`buildFlatNavFormUiModel()` returns a flat array of nodes with `dataset.level`. `buildNestedList(nodes)` converts this into the UL/LI structure used by the sidebar tree:

1) Initialize a stack with a root frame `{ level: 0, children: [] }`.
2) For each node:
   - Increase or decrease the stack to match `dataset.level`.
   - Append the node to the current frame’s `children`.
3) Finally, render a single UL with properly nested LIs using `navListTemplate`.

## Path and ID conventions

- Group ID for objects/sections: `pathToGroupId(path)` where `path` is derived from `node.dataPath` via `pointerToInputName()`
- Array group ID: also `pathToGroupId(arrayPath)`
- Array item ID: `arrayItemId(arrayPath, index)` (e.g., `form-array-item-itemList-0`)

These IDs must match the content side so clicks navigate to the right group.

## Debugging

Set `NAV_DEBUG = true` to print trace logs. Key events:

- Set dev logs in `features/navigation/builders/model-to-flat.js` if needed or instrument the builder locally. Key checkpoints are emitting array group, array item, object group/section, and recursion into children.

Use these to compare nav generation with content building when troubleshooting missing/duplicate items.

## Example: appsBanner vs appsBanner1

- `appsBanner` (single array of objects):
  - nav: `itemList` → item `#1` → grandchildren (`iconSeparator`, `urlList`, `buttonList`, `videoList`)
  - content: identical structure

- `appsBanner1` (array → item containing `appsBanner`):
  - nav: `bannerList` → item `#1` → `itemList` → item `#1` → grandchildren …
  - Depth‑first recursion over the FormUiModel ensures grandchildren like `iconSeparator` render under `bannerList[0].itemList[0]`, matching content.

## Why this mirrors GroupBuilder.build()

The navigation logic intentionally follows `GroupBuilder.build()`:

- Decide group vs section based on the presence of primitives at the current object.
- Recurse for objects and arrays in declaration order.
- For arrays, emit the array node, then each item node, then recurse into the item object node from the model.

By enforcing “one node per object” and recursing into array items, navigation cannot duplicate or skip nodes the content builder renders.

## Decision diagram (mirrors GroupBuilder.build)

Below is an ASCII decision diagram that shows the precise choices the model‑driven builder makes at each step. It mirrors the decisions in `GroupBuilder.build()` so nav == content.

```
start ──► node = modelNode (from FormUiModel)
           │
           ├─ if node.type ∉ {object,array} → return []
           │
           ├─ dottedPath = pointerToInputName(node.dataPath || '')
           │
           ├─ if node.type == 'object'
           │     │
           │     ├─ eff = SchemaService.resolve(node.schemaPointer)
           │     ├─ hasPrimitives = formGenerator.hasPrimitiveFields(eff)
           │     ├─ hasChildren = !!node.children && Object.keys(node.children).length > 0
           │     │
           │     ├─ if dottedPath != 'root' AND hasPrimitives
           │     │      └─ emit GROUP(navItem) for dottedPath (id = pathToGroupId(dottedPath))
           │     │
           │     ├─ else if hasChildren
           │     │      └─ emit SECTION(navSectionTitle) for dottedPath
           │     │
           │     └─ for each child in node.children (schema order)
           │            └─ RECURSE buildFlatNavFormUiModel(child, level + 1)
           │
           └─ else (node.type == 'array')
                 │
                 ├─ emit GROUP(navItem) for dottedPath (id = pathToGroupId(dottedPath)); set dataset.arrayPath
                 │
                 ├─ if node.activatable
                 │      └─ emit ADD(navAddItem) under array group; RETURN
                 │
                 └─ for i, item in enumerate(node.items || [])
                        ├─ emit ARRAY-ITEM(navItem) for `${dottedPath}[i]` (id = arrayItemId(dottedPath,i))
                        └─ RECURSE buildFlatNavFormUiModel(item, level + 2) with suppressSelf=true
```

Key emission rules:
- Object → exactly one node (Group OR Section), then recurse if it has children.
- Array → one group node for the array, one node per existing array item, then recurse into each item’s object node.