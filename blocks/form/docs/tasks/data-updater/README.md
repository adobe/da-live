# Data Updater: Event Intents + JSON Pointer (RFC 6901)

This task introduces a centralized, immutable JSON update mechanism driven by child component intents and applied by the parent using RFC 6901 JSON Pointers. The parent then rebuilds a fresh `FormModel` so Lit re-renders the editor, sidebar, and preview.

## Goals
- Properties down, events up: children never mutate JSON directly.
- Stable addressing: use RFC 6901 JSON Pointers in all intents.
- Immutable updates: compute a new JSON object; never deep-mutate the existing one.
- Fresh model on each change: reconstruct `FormModel` to leverage Lit’s prop-change reactivity.
- Developer ergonomics: annotated nodes include a `pointer` so views don’t compute it.

## High-level flow
1. A child (e.g., `da-form-editor` or `da-form-sidebar`) emits a `form-model-intent` event with a pointer-based op.
2. The parent (`da-form`) handles the event and applies the op immutably using `@hyperjump/json-pointer`.
3. The parent rebuilds a new `FormModel` from the updated JSON and reassigns `this.formModel`.
4. Lit propagates the change and children re-render.

See sequence.md for a diagram.

## Event contract (subset of RFC 6902)
- Event name: `form-model-intent`
- Options: `{ bubbles: true, composed: true }`
- Detail payload:
  - Replace primitive: `{ op: 'replace', path: '/person/name', value: 'Ada' }`
  - Add at index: `{ op: 'add', path: '/tags/3', value: { label: 'vip' } }`
  - Append: `{ op: 'add', path: '/tags/-', value: { label: 'beta' } }`
  - Remove at index: `{ op: 'remove', path: '/tags/2' }`

Notes:
- Arrays use zero-based indexes; append uses `-` (JSON Patch convention).
- Property names are pointer-encoded (RFC 6901): `~` → `~0`, `/` → `~1`.

## Annotated node shape
Each node in the annotated tree includes its pointer so views don’t calculate it:

```json
{
  "key": "name",
  "pointer": "/person/name",
  "data": "Ada",
  "schema": { "title": "Full Name", "properties": { "title": "Full Name" } }
}
```

- Objects: child pointer is `parentPointer + '/' + encode(childKey)`.
- Arrays: child pointer is `parentPointer + '/' + index`.
- Root node uses empty pointer `""`.

See architecture.md for component-level relationships.

## Centralized updater
- Implemented in `blocks/form/utils/updater.js`.
- Uses `@hyperjump/json-pointer` for immutable reads/writes:
  - `get(document, pointer)` to read
  - `set(document, pointer, value)` to write a new document
- Array operations are composed by reading the parent container, cloning, and writing it back via `set`.

### Pseudocode
```js
switch (op.op) {
  case 'replace':
    nextData = JSONPointer.set(data, op.path, op.value);
    break;
  case 'remove':
    const parent = JSONPointer.get(data, parentPointer);
    const nextParent = Array.isArray(parent)
      ? removeAtIndex(parent, index)
      : removeKey(parent, key);
    nextData = JSONPointer.set(data, parentPointer, nextParent);
    break;
  case 'add':
    const parent2 = JSONPointer.get(data, parentPointer);
    const nextParent2 = Array.isArray(parent2)
      ? insertAtIndex(parent2, indexOrEnd, op.value)
      : { ...parent2, [key]: op.value };
    nextData = JSONPointer.set(data, parentPointer, nextParent2);
    break;
}
```

## Integration guide
1. Re-export pointer lib
   - `deps/da-form/src/index.js`: `export * as JSONPointer from '@hyperjump/json-pointer';`
2. Add `FormModel.fromJson(json, schemas)`
   - Creates a fresh model from structured JSON and the loaded schemas.
3. Extend `annotateProp` to add `pointer`
   - Thread `parentPointer` and use `JSONPointer.encode` for keys.
4. Create `blocks/form/utils/updater.js`
   - Implement `applyOp(json, op)` for `add` | `remove` | `replace`.
5. Wire child intents
   - Editor/sidebar emit `form-model-intent` using `node.pointer`.
6. Handle intents in parent
   - Apply op, rebuild `FormModel`, reassign `this.formModel`.

## Testing checklist
- Replace primitive value renders updated input and labels correctly.
- Add array item at index inserts at the right position.
- Append array item adds to the end.
- Remove array item removes the correct index.
- Pointers with escaped characters resolve (property names containing `~` or `/`).
- Root pointer (`""`) is valid and doesn’t break traversal.

## FAQ
- Why CustomEvent instead of callback props?
  - Interoperable, crosses shadow DOM with `{ composed: true }`, and decouples parent/child.
- Why rebuild `FormModel` each time?
  - Lit reactivity triggers on reference change; a fresh, self-consistent snapshot is predictable and easy to test.
- Why include `pointer` on nodes?
  - Avoids duplication and mistakes in views; ensures correct escaping and stable addressing.

## Future work
- Support additional JSON Patch ops (`move`, `copy`, `test`) if needed.
- Batched ops for multi-field edits before a single re-render.
- Validation-on-change with visual feedback using `FormModel.validate()`.

