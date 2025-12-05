# Lit Reactivity Verification

## Overview
This document verifies that Lit reactivity works correctly after the refactoring to a flat annotated structure.

## Reactivity Flow

### 1. Data Change → New FormModel
When a field value changes:
1. User edits input → `commitValue(pointer, value)` 
2. Dispatches `form-model-intent` event with `{ op: 'replace', path: pointer, value }`
3. Parent (`da-form`) handles event → `applyOp(json, op)` → creates new JSON
4. **New FormModel instance created**: `this.formModel = new FormModel(nextJson, schemas)`
5. Lit detects `formModel` property change (reference equality)

### 2. FormModel Creation → New Nodes
When `FormModel` constructor runs:
1. Calls `buildAnnotatedStructure(jsonData, schema)`
2. Creates **new node objects** with updated `data` property
3. Each node contains:
   - `pointer`: stable identifier (RFC 6901)
   - `data`: **current value from jsonData** (updated on each change)
   - `schema`: schema metadata (stable)
   - `groupPointer`: parent relationship (stable)
   - `required`: computed metadata (stable)

### 3. Component Re-render
When `formModel` property changes:
1. Lit's `updated(changed)` lifecycle fires
2. Components check `changed.has('formModel')`
3. Components call `this.formModel.root` or `this.formModel.getChildren()`
4. **New node objects** are returned (with updated `data`)
5. Templates use `item.data` → Lit detects new values → re-renders

## Reactivity Guarantees

### ✅ Stable Array References (Cached)
- `getChildren(parentPointer)` - cached per FormModel instance
- `getFields()` - cached per FormModel instance  
- `getGroups()` - cached per FormModel instance

**Why this matters**: Prevents unnecessary re-renders when the same method is called multiple times during a single render cycle.

**Cache invalidation**: Each FormModel instance has its own cache. When data changes, a new FormModel is created, so cache is fresh.

### ✅ Node Object Identity
- Each FormModel instance creates **new node objects**
- Node objects are **immutable** (created once, never mutated)
- When data changes, new FormModel → new nodes → Lit detects change

**Why this works**: Lit uses reference equality for objects. New node objects = new references = re-render.

### ✅ Data Property Updates
- `node.data` reflects the **current value** from `jsonData`
- When `buildAnnotatedStructure()` runs, it reads from updated `jsonData`
- Templates use `item.data` directly → always shows current value

**Verification**: `annotateProp()` reads `propData` parameter, which comes from `jsonData` at construction time.

## Potential Issues & Mitigations

### Issue: Array.map() vs repeat()
**Current**: Using `.map()` directly in templates
```js
.items=${children.map((item) => this.renderList(item))}
```

**Impact**: When FormModel changes, all list items re-render (even if only one changed)

**Mitigation**: 
- Acceptable because entire FormModel is recreated anyway
- Lit's diffing algorithm handles this efficiently
- Could optimize with `repeat()` directive if needed:
  ```js
  ${repeat(children, (item) => item.pointer, (item) => this.renderList(item))}
  ```

### Issue: Multiple getChildren() calls
**Current**: `getChildren()` called multiple times in render functions

**Mitigation**: ✅ **Fixed** - Cached per FormModel instance, returns same array reference

### Issue: Node object stability
**Current**: New node objects created on every FormModel creation

**Impact**: All components re-render when any field changes

**Mitigation**: 
- This is **correct behavior** - data changed, so re-render is expected
- Lit's efficient diffing minimizes DOM updates
- Only changed DOM nodes are updated (not entire tree)

## Testing Checklist

- [x] Field value change triggers FormModel recreation
- [x] New FormModel creates new node objects with updated data
- [x] Lit detects formModel property change
- [x] Components re-render with new node data
- [x] getChildren() returns stable array references (cached)
- [x] Templates correctly display updated values
- [ ] Verify minimal DOM updates (only changed fields re-render)
- [ ] Verify no unnecessary re-renders when unrelated fields change

## Performance Considerations

### Current Approach
- **Pros**: Simple, predictable, correct reactivity
- **Cons**: Rebuilds entire structure on every change

### Optimization Opportunities
1. **Incremental updates**: Only rebuild nodes that changed (complex)
2. **repeat() directive**: Better list item identity tracking
3. **Memoization**: Cache computed values that don't depend on data

### Recommendation
Current approach is **correct and performant enough** for typical form sizes. Optimize only if profiling shows performance issues.

